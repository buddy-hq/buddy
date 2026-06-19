import type { Context } from "hono"
import { MessageID, PartID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionStatus as OpenCodeSessionStatus } from "@buddy/opencode-adapter/session-status"
import { SessionV2 as OpenCodeSessionV2 } from "@buddy/opencode-adapter/session-v2"
import { withConfigSync } from "../../http"
import {
  extractSdkErrorMessage,
  respondWithStreamSdkResult,
  sdkErrorResponse,
  type SdkResult,
} from "../../http/sdk-response"
import { createSessionCommandTransform } from "../../learning/agent-execution/transforms/command-transform"
import { createSessionMessageTransform } from "../../learning/agent-execution/transforms/message-transform"
import type {
  SessionTransform,
  SessionTransformContext,
} from "../../learning/agent-execution/transforms/types"
import { mapBuddyObjectRouteError } from "../../objects"
import {
  createMermaidRepairRequest,
  isMermaidRepairExpired,
  nextExhaustedAutoRepairState,
  readMermaidRepairRequest,
  readMermaidObject,
  readMermaidObjectRenderRecord,
  updateMermaidRepairRequest,
  updateMermaidObjectAutoRepairState,
  type MermaidObjectReadResult,
} from "../../learning/features/diagrams/service/store"
import { mapMermaidObjectRouteError } from "../../learning/features/diagrams/errors"
import { assertSessionExistsInDirectory } from "./lookup"
import { mapSessionTransformError } from "./errors"
import {
  prepareRuntimeCommandBody,
  buildSessionSdkParameters,
  prepareRuntimePromptBody,
  readValidatedJsonObject,
} from "./sdk-session"
import {
  MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS,
  type MermaidAutoRepairState,
} from "../../learning/features/diagrams/service/types"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import {
  persistCommandInvocationDisplay,
  withCommandInvocationDisplay,
} from "./command-transcript"

const MERMAID_AUTO_REPAIR_TIMEOUT_MESSAGE =
  "Automatic Mermaid repair timed out before a replacement diagram was created."
const MERMAID_AUTO_REPAIR_COMPLETED_WITHOUT_REPLACEMENT_MESSAGE =
  "Automatic Mermaid repair completed without creating a replacement diagram."
const MERMAID_AUTO_REPAIR_IDLE_EXHAUST_GRACE_MS =
  MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS * 2

type RuntimeSessionMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]

type SessionPromptAsyncTransport = (input: {
  directory: string
  sessionID: string
  body: Record<string, unknown>
}) => Promise<SdkResult<unknown>>

type MermaidRepairPromptRuntime = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
  variant?: string
}

type MermaidRepairPromptRuntimeResolver = (input: {
  object: MermaidObjectReadResult
  directory: string
}) => Promise<MermaidRepairPromptRuntime | undefined>

type SessionInteractionRuntime = {
  assertSessionExists: typeof assertSessionExistsInDirectory
  createPromptTransform: typeof createSessionMessageTransform
  sendPromptAsync: SessionPromptAsyncTransport
  resolveMermaidRepairPromptRuntime: MermaidRepairPromptRuntimeResolver
  hasCompletedMermaidRepairAssistantMessage: (input: {
    directory: string
    sessionID: string
    repairRequestID: string
  }) => Promise<boolean>
  isMermaidRepairSessionIdle: (input: {
    directory: string
    sessionID: string
  }) => Promise<boolean>
}

async function sendSessionPromptAsyncToOpenCode(input: {
  directory: string
  sessionID: string
  body: Record<string, unknown>
}): Promise<SdkResult<unknown>> {
  const client = await getOpenCodeClient(input.directory)
  return client.session.promptAsync(
    buildSessionSdkParameters({
      sessionID: input.sessionID,
      directory: input.directory,
      body: input.body,
    }),
  )
}

let sessionInteractionRuntime: SessionInteractionRuntime = {
  assertSessionExists: assertSessionExistsInDirectory,
  createPromptTransform: createSessionMessageTransform,
  sendPromptAsync: sendSessionPromptAsyncToOpenCode,
  resolveMermaidRepairPromptRuntime: resolveMermaidRepairPromptRuntimeFromOpenCode,
  hasCompletedMermaidRepairAssistantMessage: hasCompletedMermaidRepairAssistantMessageFromOpenCode,
  isMermaidRepairSessionIdle: isMermaidRepairSessionIdleFromOpenCode,
}

export function setSessionInteractionRuntimeOverrides(
  overrides: Partial<SessionInteractionRuntime>,
): () => void {
  const previousRuntime = sessionInteractionRuntime
  sessionInteractionRuntime = {
    ...sessionInteractionRuntime,
    ...overrides,
  }
  return () => {
    sessionInteractionRuntime = previousRuntime
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isUserMessageWithParts(value: unknown): value is MessageV2.WithParts {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.parts)) return false
  const info = value.info
  return isRecord(info) && info.role === "user"
}

type JsonValidatorRequest = {
  valid: (target: "json") => unknown
}

function validatedJsonBody(c: Context): unknown {
  const request = c.req as unknown as JsonValidatorRequest
  return request.valid("json")
}

async function queueSessionPromptAsync(input: {
  directory: string
  sessionID: string
  request: Request
  body: Record<string, unknown>
}): Promise<Response> {
  const transformContext: SessionTransformContext = {
    directory: input.directory,
    sessionID: input.sessionID,
    request: input.request,
  }
  const promptTransform = sessionInteractionRuntime.createPromptTransform({
    context: transformContext,
  })

  try {
    const transformed = await promptTransform.onTransform(input.body)
    const runtimeSafeBody = prepareRuntimePromptBody(transformed)
    const result = await sessionInteractionRuntime.sendPromptAsync({
      directory: input.directory,
      sessionID: input.sessionID,
      body: runtimeSafeBody,
    })

    if (result.error) {
      promptTransform.rollbackState?.()
      return sdkErrorResponse(result, { forceBusyAs409: true })
    }

    await promptTransform.onAccepted?.().catch((error) => {
      console.warn("Failed to record learner evidence after accepted prompt:", error)
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    promptTransform.rollbackState?.()
    throw error
  }
}

async function responseErrorMessage(result: {
  error?: unknown
  response?: Response
}): Promise<string> {
  const sdkMessage = result.error !== undefined ? extractSdkErrorMessage(result.error) : undefined
  if (sdkMessage) {
    return sdkMessage
  }

  if (!result.response) {
    return "Request failed"
  }

  const contentType = result.response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    const payload = (await result.response
      .clone()
      .json()
      .catch(() => undefined)) as unknown
    if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error
    }
  }
  const text = (await result.response.clone().text()).trim()
  if (text.length > 0) {
    return text
  }
  return result.response.statusText || `Request failed (${result.response.status})`
}

function runningMermaidAutoRepairState(input: {
  repairRequestID: string
  failedRenderKey: string
}): MermaidAutoRepairState {
  return {
    status: "running",
    attempts: 1,
    repairRequestID: input.repairRequestID,
    failedRenderKey: input.failedRenderKey,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isCompletedMermaidRepairAssistantMessage(input: {
  message: RuntimeSessionMessage
  repairRequestID: string
}): boolean {
  const info = input.message.info
  return (
    info.role === "assistant" &&
    info.parentID === input.repairRequestID &&
    typeof info.time.completed === "number"
  )
}

async function hasCompletedMermaidRepairAssistantMessageFromOpenCode(input: {
  directory: string
  sessionID: string
  repairRequestID: string
}): Promise<boolean> {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const messages = await OpenCodeSession.messages({
        sessionID: SessionID.make(input.sessionID),
      })
      return messages.some((message) =>
        isCompletedMermaidRepairAssistantMessage({
          message,
          repairRequestID: input.repairRequestID,
        }),
      )
    },
  })
}

async function isMermaidRepairSessionIdleFromOpenCode(input: {
  directory: string
  sessionID: string
}): Promise<boolean> {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const status = await OpenCodeSessionStatus.get(SessionID.make(input.sessionID))
      return status.type === "idle"
    },
  })
}

function isMermaidRepairPastIdleGrace(input: { createdAt: string }): boolean {
  const createdAtMs = Date.parse(input.createdAt)
  return (
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs >= MERMAID_AUTO_REPAIR_IDLE_EXHAUST_GRACE_MS
  )
}

function mermaidSessionOrigin(object: MermaidObjectReadResult): {
  sessionID: string
  messageID: string
} | undefined {
  const origin = object.origin
  if (origin.kind === "tool" || origin.kind === "markdown") {
    return {
      sessionID: origin.sessionID,
      messageID: origin.messageID,
    }
  }
  return undefined
}

async function exhaustMermaidRepairRequest(input: {
  directory: string
  errorMessage: string
  repairRequestID: string
}) {
  const request = await updateMermaidRepairRequest(input.directory, input.repairRequestID, {
    status: "exhausted",
    lastErrorMessage: input.errorMessage,
  })
  const currentObject = await readMermaidObject({
    directory: input.directory,
    objectID: request.objectID,
  })
  if (currentObject.revisionID === request.revisionID) {
    await updateMermaidObjectAutoRepairState({
      directory: input.directory,
      objectID: request.objectID,
      state: nextExhaustedAutoRepairState(input.errorMessage),
    })
  }
  return request
}

async function exhaustMermaidRepairAttempt(input: {
  directory: string
  errorMessage: string
  repairRequestID: string
}): Promise<Response> {
  await exhaustMermaidRepairRequest(input)
  return Response.json({
    repairRequestID: input.repairRequestID,
    status: "exhausted",
    lastErrorMessage: input.errorMessage,
  })
}

function mermaidAutoRepairPrompt(input: {
  repairRequestID: string
  objectID: string
  failedRenderKey: string
  errorMessage: string
  alt: string
  caption?: string
  source: string
}): string {
  return [
    `<buddy_internal_mermaid_auto_repair repairRequestID="${input.repairRequestID}" objectID="${input.objectID}" failedRenderKey="${input.failedRenderKey}">`,
    "The previous Mermaid diagram failed in the browser renderer.",
    "",
    "Your task:",
    "1. Fix the Mermaid source below.",
    "2. Preserve the original intent, alt text, and caption.",
    "3. Call render_mermaid exactly once.",
    `4. Include repairOfObjectID: "${input.objectID}" in the render_mermaid call.`,
    `5. Use exactly this alt text in the render_mermaid call: "${input.alt}".`,
    ...(input.caption
      ? [`6. Use exactly this caption in the render_mermaid call: "${input.caption}".`]
      : ["6. Do not invent a caption; omit caption unless the source itself requires one."]),
    "7. Do not answer with a visible explanation before calling render_mermaid.",
    "8. Copy the object ID verbatim. Do not replace it with a placeholder, zeros, repeated characters, or a guessed ID.",
    "",
    "Original user-facing labels:",
    `Alt: ${input.alt}`,
    `Caption: ${input.caption ?? "(none)"}`,
    "",
    "Browser render error:",
    input.errorMessage,
    "",
    "Source:",
    "```mermaid",
    input.source,
    "```",
    "</buddy_internal_mermaid_auto_repair>",
  ].join("\n")
}

async function resolveMermaidRepairPromptRuntimeFromOpenCode(input: {
  object: MermaidObjectReadResult
  directory: string
}): Promise<MermaidRepairPromptRuntime | undefined> {
  const origin = mermaidSessionOrigin(input.object)
  if (!origin) return undefined
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const v2Messages = await OpenCodeSessionV2.messages({
        sessionID: OpenCodeSessionV2.ID.make(origin.sessionID),
        order: "asc",
      })
      const v2Message = v2Messages.find((entry) => entry.id === origin.messageID)
      if (v2Message?.type === "assistant") {
        return {
          agent: v2Message.agent,
          model: {
            providerID: v2Message.model.providerID,
            modelID: v2Message.model.id,
          },
          ...(v2Message.model.variant ? { variant: v2Message.model.variant } : {}),
        }
      }

      const priorMessages = await OpenCodeSession.messages({
        sessionID: SessionID.make(origin.sessionID),
      })
      const priorMessage = priorMessages.find(
        (entry) => entry.info.id === origin.messageID,
      )
      if (!priorMessage || priorMessage.info.role !== "assistant") return undefined

      return {
        agent: priorMessage.info.agent,
        model: {
          providerID: priorMessage.info.providerID,
          modelID: priorMessage.info.modelID,
        },
        ...(priorMessage.info.variant ? { variant: priorMessage.info.variant } : {}),
      }
    },
  })
}

export async function postSessionPrompt(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const body = await readValidatedJsonObject(c)
  if (body instanceof Response) return body

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory
  let promptTransform: SessionTransform | undefined

  try {
    await assertSessionExistsInDirectory({
      directory,
      sessionID,
      request: c.req.raw,
    })

    promptTransform = createSessionMessageTransform({
      context: { directory, sessionID, request: c.req.raw },
    })
    const transformed = await promptTransform.onTransform(body)
    const runtimeSafeBody = prepareRuntimePromptBody(transformed)

    const client = await getOpenCodeClient(directory)
    const result = await client.session.prompt(
      buildSessionSdkParameters({
        sessionID,
        directory,
        body: runtimeSafeBody,
      }),
      { parseAs: "stream" },
    )

    if (result.error) {
      promptTransform.rollbackState?.()
      return respondWithStreamSdkResult(c, result, { forceBusyAs409: true })
    }

    await promptTransform.onAccepted?.().catch((error) => {
      console.warn("Failed to record learner evidence after accepted prompt:", error)
    })

    return respondWithStreamSdkResult(c, result, { forceBusyAs409: true })
  } catch (error) {
    promptTransform?.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export async function postSessionPromptAsync(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const body = await readValidatedJsonObject(c)
  if (body instanceof Response) return body

  const sessionID = c.req.param("sessionID")
  try {
    await sessionInteractionRuntime.assertSessionExists({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
    })
    return await queueSessionPromptAsync({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
      body,
    })
  } catch (error) {
    const mermaidResponse = mapBuddyObjectRouteError(error) ?? mapMermaidObjectRouteError(error)
    if (mermaidResponse) return mermaidResponse
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export async function postSessionCommand(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "command",
  })
  if (!syncResult.ok) return syncResult.response

  const body = await readValidatedJsonObject(c)
  if (body instanceof Response) return body

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory
  let commandTransform: SessionTransform | undefined

  try {
    await assertSessionExistsInDirectory({
      directory,
      sessionID,
      request: c.req.raw,
    })

    const rawCommandMessageID = body.messageID
    const commandMessageID =
      typeof rawCommandMessageID === "string" ? MessageID.make(rawCommandMessageID) : MessageID.ascending()
    const commandBody = {
      ...body,
      messageID: commandMessageID,
    }

    commandTransform = createSessionCommandTransform({
      context: { directory, sessionID, request: c.req.raw },
    })
    const transformed = await commandTransform.onTransform(commandBody)
    const runtimeSafeBody = prepareRuntimeCommandBody(transformed)

    const client = await getOpenCodeClient(directory)
    const result = await client.session.command(
      buildSessionSdkParameters({
        sessionID,
        directory,
        body: runtimeSafeBody,
      }),
    )

    if (result.error) {
      commandTransform.rollbackState?.()
      return sdkErrorResponse(result, { forceBusyAs409: true })
    }

    const commandDisplay = {
      command: typeof runtimeSafeBody.command === "string" ? runtimeSafeBody.command : "",
      argumentsText: typeof runtimeSafeBody.arguments === "string" ? runtimeSafeBody.arguments : "",
      contextPartID: PartID.ascending(),
    }
    const rawResponseData: unknown = result.data
    const responseData = isUserMessageWithParts(rawResponseData)
      ? withCommandInvocationDisplay(rawResponseData, commandDisplay)
      : result.data

    try {
      await persistCommandInvocationDisplay({
        directory,
        sessionID,
        messageID: commandMessageID,
        ...commandDisplay,
      })
    } catch {
      // The command has already executed; display compaction must not convert it into a failed send.
    }

    return Response.json(responseData)
  } catch (error) {
    commandTransform?.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export async function postSessionMermaidRepairAsync(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const body = validatedJsonBody(c)
  if (!isRecord(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const objectID = typeof body.objectID === "string" ? body.objectID : undefined
  const failedRenderKey =
    typeof body.failedRenderKey === "string" ? body.failedRenderKey : undefined
  if (!objectID || !failedRenderKey) {
    return Response.json({ error: "objectID and failedRenderKey are required." }, { status: 400 })
  }

  try {
    await sessionInteractionRuntime.assertSessionExists({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
    })

    const object = await readMermaidObject({
      directory: syncResult.value.directory,
      objectID,
    })
    const objectOrigin = mermaidSessionOrigin(object)
    if (objectOrigin?.sessionID !== sessionID) {
      return Response.json(
        { error: "Mermaid object was not found for this session." },
        { status: 404 },
      )
    }
    const failedRender = await readMermaidObjectRenderRecord({
      directory: syncResult.value.directory,
      objectID: object.objectID,
      revisionID: object.revisionID,
      renderKey: failedRenderKey,
    })

    if (failedRender.status !== "failed") {
      return Response.json(
        { error: "Only failed Mermaid renders can be repaired." },
        { status: 400 },
      )
    }
    if (object.sourceHash !== failedRender.sourceHash) {
      return Response.json(
        {
          error: "Mermaid repair requires the failed render to match the current object source.",
        },
        { status: 400 },
      )
    }
    if (object.autoRepair.attempts >= 1) {
      return Response.json(
        { error: "Automatic Mermaid repair already used its single attempt." },
        { status: 409 },
      )
    }

    const request = await createMermaidRepairRequest({
      directory: syncResult.value.directory,
      sessionID,
      objectID: object.objectID,
      revisionID: object.revisionID,
      failedRenderKey,
    })

    await updateMermaidObjectAutoRepairState({
      directory: syncResult.value.directory,
      objectID: object.objectID,
      state: runningMermaidAutoRepairState({
        repairRequestID: request.repairRequestID,
        failedRenderKey,
      }),
    })

    const repairRuntime = await sessionInteractionRuntime.resolveMermaidRepairPromptRuntime({
      directory: syncResult.value.directory,
      object,
    })

    let response: Response
    try {
      response = await queueSessionPromptAsync({
        directory: syncResult.value.directory,
        sessionID,
        request: c.req.raw,
        body: {
          messageID: request.repairRequestID,
          ...(repairRuntime
            ? {
                agent: repairRuntime.agent,
                model: repairRuntime.model,
                ...(repairRuntime.variant ? { variant: repairRuntime.variant } : {}),
              }
            : {}),
          content: mermaidAutoRepairPrompt({
            repairRequestID: request.repairRequestID,
            objectID: object.objectID,
            failedRenderKey,
            errorMessage: failedRender.errorMessage,
            alt: object.alt,
            ...(object.caption ? { caption: object.caption } : {}),
            source: object.source,
          }),
        },
      })
    } catch (error) {
      return exhaustMermaidRepairAttempt({
        directory: syncResult.value.directory,
        repairRequestID: request.repairRequestID,
        errorMessage: errorMessage(error),
      })
    }

    if (!response.ok) {
      const errorMessage = await responseErrorMessage({ response })
      return exhaustMermaidRepairAttempt({
        directory: syncResult.value.directory,
        repairRequestID: request.repairRequestID,
        errorMessage,
      })
    }

    return Response.json({
      repairRequestID: request.repairRequestID,
      status: "running",
    })
  } catch (error) {
    const mermaidResponse = mapBuddyObjectRouteError(error) ?? mapMermaidObjectRouteError(error)
    if (mermaidResponse) return mermaidResponse
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export async function getSessionMermaidRepairStatus(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const repairRequestID = c.req.param("repairRequestID")

  try {
    await sessionInteractionRuntime.assertSessionExists({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
    })

    const request = await readMermaidRepairRequest(syncResult.value.directory, repairRequestID)
    if (request.sessionID !== sessionID) {
      return Response.json({ error: "Mermaid repair request was not found." }, { status: 404 })
    }

    const hasCompletedRepairAssistantMessage =
      request.status === "running" &&
      (await sessionInteractionRuntime.hasCompletedMermaidRepairAssistantMessage({
        directory: syncResult.value.directory,
        sessionID,
        repairRequestID: request.repairRequestID,
      }))
    const shouldExhaustIdleRepair =
      request.status === "running" &&
      !hasCompletedRepairAssistantMessage &&
      isMermaidRepairPastIdleGrace(request) &&
      (await sessionInteractionRuntime.isMermaidRepairSessionIdle({
        directory: syncResult.value.directory,
        sessionID,
      }))
    const shouldExhaustCompletedRepair =
      hasCompletedRepairAssistantMessage || shouldExhaustIdleRepair

    const currentRequest = isMermaidRepairExpired(request)
      ? await exhaustMermaidRepairRequest({
          directory: syncResult.value.directory,
          repairRequestID: request.repairRequestID,
          errorMessage: MERMAID_AUTO_REPAIR_TIMEOUT_MESSAGE,
        })
      : shouldExhaustCompletedRepair
        ? await exhaustMermaidRepairRequest({
            directory: syncResult.value.directory,
            repairRequestID: request.repairRequestID,
            errorMessage: MERMAID_AUTO_REPAIR_COMPLETED_WITHOUT_REPLACEMENT_MESSAGE,
          })
        : request

    return Response.json({
      repairRequestID: currentRequest.repairRequestID,
      status: currentRequest.status,
      ...(currentRequest.replacementRevisionID
        ? { replacementRevisionID: currentRequest.replacementRevisionID }
        : {}),
      ...(currentRequest.lastErrorMessage
        ? { lastErrorMessage: currentRequest.lastErrorMessage }
        : {}),
    })
  } catch (error) {
    const mermaidResponse = mapBuddyObjectRouteError(error) ?? mapMermaidObjectRouteError(error)
    if (mermaidResponse) return mermaidResponse
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export { queueSessionPromptAsync }
