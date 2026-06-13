import type { Context } from "hono"
import { MessageID, PartID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionV2 as OpenCodeSessionV2 } from "@buddy/opencode-adapter/session-v2"
import { withConfigSync } from "../../http"
import {
  extractSdkErrorMessage,
  respondWithStreamSdkResult,
  sdkErrorResponse,
} from "../../http/sdk-response"
import { createSessionCommandTransform } from "../../learning/agent-execution/transforms/command-transform"
import { createSessionMessageTransform } from "../../learning/agent-execution/transforms/message-transform"
import type {
  SessionTransform,
  SessionTransformContext,
} from "../../learning/agent-execution/transforms/types"
import {
  createMermaidRepairRequest,
  isMermaidRepairExpired,
  nextExhaustedAutoRepairState,
  readMermaidRepairRequest,
  readMermaidArtifact,
  readMermaidRenderRecord,
  updateMermaidRepairRequest,
  updateMermaidAutoRepairState,
} from "../../learning/features/diagrams/service/store"
import { mapMermaidArtifactRouteError } from "../../learning/features/diagrams/errors"
import { assertSessionExistsInDirectory } from "./lookup"
import { mapSessionTransformError } from "./errors"
import {
  prepareRuntimeCommandBody,
  buildSessionSdkParameters,
  prepareRuntimePromptBody,
  readValidatedJsonObject,
} from "./sdk-session"
import type {
  MermaidArtifactReadResult,
  MermaidAutoRepairState,
} from "../../learning/features/diagrams/service/types"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import {
  persistCommandInvocationDisplay,
  withCommandInvocationDisplay,
} from "./command-transcript"

const MERMAID_AUTO_REPAIR_TIMEOUT_MESSAGE =
  "Automatic Mermaid repair timed out before a replacement diagram was created."

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
  const promptTransform = createSessionMessageTransform({
    context: transformContext,
  })

  try {
    const transformed = await promptTransform.onTransform(input.body)
    const runtimeSafeBody = prepareRuntimePromptBody(transformed)
    const client = await getOpenCodeClient(input.directory)
    const result = await client.session.promptAsync(
      buildSessionSdkParameters({
        sessionID: input.sessionID,
        directory: input.directory,
        body: runtimeSafeBody,
      }),
    )

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

type MermaidRepairPromptRuntime = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
  variant?: string
}

async function exhaustMermaidRepairAttempt(input: {
  artifactID: string
  directory: string
  errorMessage: string
  repairRequestID: string
}): Promise<Response> {
  await updateMermaidRepairRequest(input.directory, input.repairRequestID, {
    status: "exhausted",
    lastErrorMessage: input.errorMessage,
  })
  await updateMermaidAutoRepairState(
    input.directory,
    input.artifactID,
    nextExhaustedAutoRepairState(input.errorMessage),
  )
  return Response.json({
    repairRequestID: input.repairRequestID,
    status: "exhausted",
    lastErrorMessage: input.errorMessage,
  })
}

function mermaidAutoRepairPrompt(input: {
  repairRequestID: string
  artifactID: string
  failedRenderKey: string
  errorMessage: string
  alt: string
  caption?: string
  source: string
}): string {
  return [
    `<buddy_internal_mermaid_auto_repair repairRequestID="${input.repairRequestID}" artifactID="${input.artifactID}" failedRenderKey="${input.failedRenderKey}">`,
    "The previous Mermaid diagram failed in the browser renderer.",
    "",
    "Your task:",
    "1. Fix the Mermaid source below.",
    "2. Preserve the original intent, alt text, and caption.",
    "3. Call render_mermaid exactly once.",
    `4. Include repairOfArtifactID: "${input.artifactID}" in the render_mermaid call.`,
    `5. Use exactly this alt text in the render_mermaid call: "${input.alt}".`,
    ...(input.caption
      ? [`6. Use exactly this caption in the render_mermaid call: "${input.caption}".`]
      : ["6. Do not invent a caption; omit caption unless the source itself requires one."]),
    "7. Do not answer with a visible explanation before calling render_mermaid.",
    "8. Copy the artifact ID verbatim. Do not replace it with a placeholder, zeros, repeated characters, or a guessed ID.",
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

async function resolveMermaidRepairPromptRuntime(input: {
  artifact: MermaidArtifactReadResult
  directory: string
}): Promise<MermaidRepairPromptRuntime | undefined> {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const v2Messages = await OpenCodeSessionV2.messages({
        sessionID: OpenCodeSessionV2.ID.make(input.artifact.origin.sessionID),
        order: "asc",
      })
      const v2Message = v2Messages.find((entry) => entry.id === input.artifact.origin.messageID)
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

      const legacyMessages = await OpenCodeSession.messages({
        sessionID: SessionID.make(input.artifact.origin.sessionID),
      })
      const legacyMessage = legacyMessages.find(
        (entry) => entry.info.id === input.artifact.origin.messageID,
      )
      if (!legacyMessage || legacyMessage.info.role !== "assistant") return undefined

      return {
        agent: legacyMessage.info.agent,
        model: {
          providerID: legacyMessage.info.providerID,
          modelID: legacyMessage.info.modelID,
        },
        ...(legacyMessage.info.variant ? { variant: legacyMessage.info.variant } : {}),
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
    await assertSessionExistsInDirectory({
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
    const mermaidResponse = mapMermaidArtifactRouteError(error)
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

  const artifactID = typeof body.artifactID === "string" ? body.artifactID : undefined
  const failedRenderKey =
    typeof body.failedRenderKey === "string" ? body.failedRenderKey : undefined
  if (!artifactID || !failedRenderKey) {
    return Response.json({ error: "artifactID and failedRenderKey are required." }, { status: 400 })
  }

  try {
    await assertSessionExistsInDirectory({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
    })

    const artifact = await readMermaidArtifact(syncResult.value.directory, artifactID)
    if (artifact.origin.sessionID !== sessionID) {
      return Response.json(
        { error: "Mermaid artifact was not found for this session." },
        { status: 404 },
      )
    }
    const failedRender = await readMermaidRenderRecord(
      syncResult.value.directory,
      artifact.artifactID,
      failedRenderKey,
    )

    if (failedRender.status !== "failed") {
      return Response.json(
        { error: "Only failed Mermaid renders can be repaired." },
        { status: 400 },
      )
    }
    if (artifact.sourceHash !== failedRender.sourceHash) {
      return Response.json(
        {
          error: "Mermaid repair requires the failed render to match the current artifact source.",
        },
        { status: 400 },
      )
    }
    if (artifact.autoRepair.attempts >= 1) {
      return Response.json(
        { error: "Automatic Mermaid repair already used its single attempt." },
        { status: 409 },
      )
    }

    const request = await createMermaidRepairRequest({
      directory: syncResult.value.directory,
      sessionID,
      artifactID: artifact.artifactID,
      failedRenderKey,
    })

    await updateMermaidAutoRepairState(
      syncResult.value.directory,
      artifact.artifactID,
      runningMermaidAutoRepairState({
        repairRequestID: request.repairRequestID,
        failedRenderKey,
      }),
    )

    const repairRuntime = await resolveMermaidRepairPromptRuntime({
      directory: syncResult.value.directory,
      artifact,
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
            artifactID: artifact.artifactID,
            failedRenderKey,
            errorMessage: failedRender.errorMessage,
            alt: artifact.alt,
            ...(artifact.caption ? { caption: artifact.caption } : {}),
            source: artifact.source,
          }),
        },
      })
    } catch (error) {
      return exhaustMermaidRepairAttempt({
        directory: syncResult.value.directory,
        artifactID: artifact.artifactID,
        repairRequestID: request.repairRequestID,
        errorMessage: errorMessage(error),
      })
    }

    if (!response.ok) {
      const errorMessage = await responseErrorMessage({ response })
      return exhaustMermaidRepairAttempt({
        directory: syncResult.value.directory,
        artifactID: artifact.artifactID,
        repairRequestID: request.repairRequestID,
        errorMessage,
      })
    }

    return Response.json({
      repairRequestID: request.repairRequestID,
      status: "running",
    })
  } catch (error) {
    const mermaidResponse = mapMermaidArtifactRouteError(error)
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
    await assertSessionExistsInDirectory({
      directory: syncResult.value.directory,
      sessionID,
      request: c.req.raw,
    })

    const request = await readMermaidRepairRequest(syncResult.value.directory, repairRequestID)
    if (request.sessionID !== sessionID) {
      return Response.json({ error: "Mermaid repair request was not found." }, { status: 404 })
    }

    const currentRequest = isMermaidRepairExpired(request)
      ? await updateMermaidRepairRequest(syncResult.value.directory, request.repairRequestID, {
          status: "exhausted",
          lastErrorMessage: MERMAID_AUTO_REPAIR_TIMEOUT_MESSAGE,
        }).then(async (updated) => {
          await updateMermaidAutoRepairState(
            syncResult.value.directory,
            updated.artifactID,
            nextExhaustedAutoRepairState(MERMAID_AUTO_REPAIR_TIMEOUT_MESSAGE),
          )
          return updated
        })
      : request

    return Response.json({
      repairRequestID: currentRequest.repairRequestID,
      status: currentRequest.status,
      ...(currentRequest.replacementArtifactID
        ? { replacementArtifactID: currentRequest.replacementArtifactID }
        : {}),
      ...(currentRequest.lastErrorMessage
        ? { lastErrorMessage: currentRequest.lastErrorMessage }
        : {}),
    })
  } catch (error) {
    const mermaidResponse = mapMermaidArtifactRouteError(error)
    if (mermaidResponse) return mermaidResponse
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export { queueSessionPromptAsync }
