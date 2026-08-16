import type { Context } from "hono"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { MessageV2 as OpenCodeMessage } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { withToolPresentationOnMessages } from "@buddy/opencode-adapter/session-tool-presentation"
import { ensureAllowedDirectory } from "../../http"
import { sdkErrorResponse } from "../../http/sdk-response"
import { withConfigSync } from "../../http/route-helpers"
import { runLearnerMemoryStartupPipeline } from "../../learning/features/memory"
import {
  clearDynamicLearningToolsForDeletedSessions,
  clearDynamicLearningToolsForEndedSession,
} from "../../learning/runtime/dynamic-tool-grants"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { ensureBuddyToolPresentationCatalog } from "../../opencode-runtime/buddy-tool-presentation-catalog"
import { resolveDirectory } from "../../project"
import { toSessionSdkResult } from "./sdk-session"
import {
  ensureRuntimeSessionExists,
  loadRuntimeSessionInDirectory,
  runtimeSessionLookupErrorResponse,
} from "./lookup"
import {
  parseTSessionBoolean,
  parseTSessionJsonObject,
  parseTSessionJsonValidator,
  parseTSessionNumber,
  parseTSessionString,
  type TSessionJsonObject,
} from "./parse-values"

type TSessionMessagesQuery = {
  limit?: number
  before?: string
}

type TSessionPatchBody = {
  title?: string
  permission?: PermissionRuleset
  time?: {
    archived?: number
  }
}

type TSessionSummarizeBody = {
  providerID?: string
  modelID?: string
  auto?: boolean
}

const SESSION_NOT_FOUND_ERROR = "Session not found"
const NOT_FOUND_STATUS = 404
const LINK_HEADER = "Link"
const NEXT_CURSOR_HEADER = "X-Next-Cursor"
const EXPOSE_HEADERS_HEADER = "Access-Control-Expose-Headers"

function parseTPermissionRuleset<TValue>(value: TValue): PermissionRuleset | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const rules: PermissionRuleset = []
  for (const entry of value) {
    const record = parseTSessionJsonObject(entry)
    const permission = parseTSessionString(record?.permission)
    const pattern = parseTSessionString(record?.pattern)
    const action = parseTSessionString(record?.action)
    if (
      permission === undefined ||
      pattern === undefined ||
      (action !== "allow" && action !== "deny" && action !== "ask")
    ) {
      return undefined
    }
    rules.push({ permission, pattern, action })
  }
  return rules
}

function parseTSessionPatchBody<TValue>(value: TValue): TSessionPatchBody | undefined {
  const record = parseTSessionJsonObject(value)
  if (record === undefined) {
    return undefined
  }
  const title = parseTSessionString(record.title)
  const permission = parseTPermissionRuleset(record.permission)
  const archived = parseTSessionNumber(parseTSessionJsonObject(record.time)?.archived)
  return Object.assign(
    {},
    title === undefined ? undefined : { title },
    permission === undefined ? undefined : { permission },
    archived === undefined ? undefined : { time: { archived } },
  )
}

function parseTSessionSummarizeBody<TValue>(value: TValue): TSessionSummarizeBody | undefined {
  const record = parseTSessionJsonObject(value)
  if (record === undefined) {
    return undefined
  }
  const providerID = parseTSessionString(record.providerID)
  const modelID = parseTSessionString(record.modelID)
  const auto = parseTSessionBoolean(record.auto)
  return Object.assign(
    {},
    providerID === undefined ? undefined : { providerID },
    modelID === undefined ? undefined : { modelID },
    auto === undefined ? undefined : { auto },
  )
}

function readValidatedJsonBody(c: Context): TSessionJsonObject | undefined {
  const valid = parseTSessionJsonValidator(c.req.valid.bind(c.req))
  if (valid === undefined) {
    return undefined
  }
  try {
    return valid("json")
  } catch {
    return undefined
  }
}

function readSessionMessagesQuery(c: Context): TSessionMessagesQuery {
  const params = new URL(c.req.url).searchParams
  const rawLimit = params.get("limit")
  const before = params.get("before") ?? undefined
  if (rawLimit === null) {
    return { before }
  }

  const limit = Number(rawLimit)
  return Number.isFinite(limit) ? { limit, before } : { before }
}

function readSessionListQuery(c: Context) {
  const params = new URL(c.req.url).searchParams
  const query: Record<string, string | number | boolean> = {}

  for (const key of ["scope", "path", "roots", "start", "search"] as const) {
    const value = params.get(key)
    if (value) {
      query[key] = value
    }
  }

  const rawLimit = params.get("limit")
  if (rawLimit !== null) {
    const limit = Number(rawLimit)
    if (Number.isFinite(limit)) {
      query.limit = limit
    }
  }

  return query
}

function buildSessionListParams(c: Context) {
  const params = new URL(c.req.url).searchParams
  const query = readSessionListQuery(c)
  const explicitDirectory = params.get("directory")

  if (explicitDirectory) {
    return {
      ...query,
      directory: resolveDirectory(explicitDirectory),
    }
  }

  if (query.scope === undefined) {
    return {
      ...query,
      scope: "project" as const,
    }
  }

  return query
}

function buildSessionCreateParams(directory: string, body: TSessionJsonObject) {
  const rest: TSessionJsonObject = { ...body }
  delete rest.directory
  delete rest.workspace
  delete rest.sessionID
  return {
    directory,
    ...rest,
  }
}

function buildSessionUpdateParams(input: {
  sessionID: string
  directory: string
  body: TSessionPatchBody | undefined
}) {
  return Object.assign(
    { sessionID: input.sessionID, directory: input.directory },
    input.body?.title === undefined ? undefined : { title: input.body.title },
    input.body?.permission === undefined ? undefined : { permission: input.body.permission },
    input.body?.time?.archived === undefined
      ? undefined
      : { time: { archived: input.body.time.archived } },
  )
}

function buildSessionSummarizeParams(input: {
  sessionID: string
  directory: string
  body: TSessionSummarizeBody | undefined
}) {
  return Object.assign(
    { sessionID: input.sessionID, directory: input.directory },
    input.body?.providerID === undefined ? undefined : { providerID: input.body.providerID },
    input.body?.modelID === undefined ? undefined : { modelID: input.body.modelID },
    input.body?.auto === undefined ? undefined : { auto: input.body.auto },
  )
}

export async function proxySessionCollection(c: Context): Promise<Response> {
  if (c.req.method === "POST") {
    const syncResult = await withConfigSync(c, {
      operation: "session creation",
    })
    if (!syncResult.ok) return syncResult.response

    const rawBody = readValidatedJsonBody(c)
    const body = rawBody ?? {}
    const client = await getOpenCodeClient(syncResult.value.directory)
    const result = toSessionSdkResult(
      await client.session.create(
        buildSessionCreateParams(syncResult.value.directory, body),
      ),
    )

    if (result.error) {
      return sdkErrorResponse(result)
    }

    const session = result.data
    if (session?.id) {
      runLearnerMemoryStartupPipeline({
        directory: syncResult.value.directory,
        currentSessionID: session.id,
      }).catch((cause: unknown) => {
        console.warn("Learner memory startup pipeline failed:", cause)
      })
    }

    return Response.json(session)
  }

  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const client = await getOpenCodeClient(directoryResult.directory)
  const result = toSessionSdkResult(
    await client.session.list({
      ...buildSessionListParams(c),
    }),
  )

  if (result.error) {
    return sdkErrorResponse(result)
  }

  return Response.json(result.data)
}

export async function getSessionStatus(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const client = await getOpenCodeClient(directoryResult.directory)
  const result = toSessionSdkResult(
    await client.session.status({
      directory: directoryResult.directory,
    }),
  )

  if (result.error) {
    return sdkErrorResponse(result)
  }

  return Response.json(result.data)
}

export async function getSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  try {
    const session = await loadRuntimeSessionInDirectory(directoryResult.directory, sessionID)
    if (!session) {
      return c.json({ error: SESSION_NOT_FOUND_ERROR }, NOT_FOUND_STATUS)
    }
    return c.json(session)
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

async function collectSessionFamilyIDs(directory: string, sessionID: string): Promise<string[]> {
  return OpenCodeInstance.provide({
    directory,
    async fn() {
      const familyIDs: string[] = []

      async function collect(currentSessionID: SessionID): Promise<void> {
        familyIDs.push(currentSessionID)
        const children = await OpenCodeSession.children(currentSessionID)
        for (const child of children) {
          await collect(child.id)
        }
      }

      await collect(SessionID.make(sessionID))
      return familyIDs
    },
  })
}

export async function deleteSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(directoryResult.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const familySessionIDs = await collectSessionFamilyIDs(directoryResult.directory, sessionID)

  const client = await getOpenCodeClient(directoryResult.directory)
  const result = toSessionSdkResult(
    await client.session.delete({
      sessionID,
      directory: directoryResult.directory,
    }),
  )

  if (result.error) {
    return sdkErrorResponse(result)
  }

  if (result.data) {
    try {
      clearDynamicLearningToolsForDeletedSessions({
        directory: directoryResult.directory,
        sessionIDs: familySessionIDs,
      })
    } catch (error) {
      console.warn("Failed to clear dynamic learning tools after deleting session", error)
    }
  }

  return Response.json(result.data)
}

export async function patchSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(directoryResult.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const body = parseTSessionPatchBody(readValidatedJsonBody(c))
  const client = await getOpenCodeClient(directoryResult.directory)
  const result = toSessionSdkResult(
    await client.session.update(
      buildSessionUpdateParams({
        sessionID,
        directory: directoryResult.directory,
        body,
      }),
    ),
  )

  if (result.error) {
    return sdkErrorResponse(result)
  }

  if (body?.time?.archived !== undefined) {
    try {
      await clearDynamicLearningToolsForEndedSession({
        directory: directoryResult.directory,
        sessionID,
      })
    } catch (error) {
      console.warn("Failed to clear dynamic learning tools after archiving session", error)
    }
  }

  return Response.json(result.data)
}

export async function summarizeSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session compaction",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const body = parseTSessionSummarizeBody(readValidatedJsonBody(c))
  const client = await getOpenCodeClient(syncResult.value.directory)
  const result = toSessionSdkResult(
    await client.session.summarize(
      buildSessionSummarizeParams({
        sessionID,
        directory: syncResult.value.directory,
        body,
      }),
    ),
  )

  if (result.error) {
    return sdkErrorResponse(result, { forceBusyAs409: true })
  }

  return Response.json(result.data ?? true)
}

export async function revertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session revert",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const client = await getOpenCodeClient(syncResult.value.directory)
  const body = readValidatedJsonBody(c) ?? {}
  const messageID = parseTSessionString(body.messageID)
  const partID = parseTSessionString(body.partID)
  const result = toSessionSdkResult(
    await client.session.revert(
      Object.assign(
        {
          sessionID,
          directory: syncResult.value.directory,
        },
        messageID === undefined ? undefined : { messageID },
        partID === undefined ? undefined : { partID },
      ),
    ),
  )

  if (result.error) {
    return sdkErrorResponse(result, { forceBusyAs409: true })
  }

  return Response.json(result.data ?? true)
}

export async function forkSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session fork",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const client = await getOpenCodeClient(syncResult.value.directory)
  const body = readValidatedJsonBody(c) ?? {}
  const messageID = parseTSessionString(body.messageID)
  const result = toSessionSdkResult(
    await client.session.fork(
      Object.assign(
        {
          sessionID,
          directory: syncResult.value.directory,
        },
        messageID === undefined ? undefined : { messageID },
      ),
    ),
  )

  if (result.error) {
    return sdkErrorResponse(result, { forceBusyAs409: true })
  }

  return Response.json(result.data ?? true)
}

export async function unrevertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session unrevert",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const client = await getOpenCodeClient(syncResult.value.directory)
  const result = toSessionSdkResult(
    await client.session.unrevert({
      sessionID,
      directory: syncResult.value.directory,
    }),
  )

  if (result.error) {
    return sdkErrorResponse(result, { forceBusyAs409: true })
  }

  return Response.json(result.data ?? true)
}

export async function listSessionMessages(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const query = readSessionMessagesQuery(c)

  try {
    const session = await loadRuntimeSessionInDirectory(directoryResult.directory, sessionID)
    if (!session) {
      return c.json({ error: SESSION_NOT_FOUND_ERROR }, NOT_FOUND_STATUS)
    }

    await ensureBuddyToolPresentationCatalog(directoryResult.directory)

    const runtimeSessionID = SessionID.make(session.id)
    const payload = await OpenCodeInstance.provide({
      directory: directoryResult.directory,
      fn: async () => {
        if (query.limit === undefined || query.limit === 0) {
          const messages = await OpenCodeSession.messages({ sessionID: runtimeSessionID })
          return {
            items: messages,
            cursor: undefined,
          }
        }

        return OpenCodeMessage.page({
          sessionID: runtimeSessionID,
          limit: query.limit,
          before: query.before,
        })
      },
    })

    if (payload.cursor && query.limit !== undefined) {
      const nextUrl = new URL(c.req.url)
      nextUrl.searchParams.set("limit", query.limit.toString())
      nextUrl.searchParams.set("before", payload.cursor)
      c.header(EXPOSE_HEADERS_HEADER, `${LINK_HEADER}, ${NEXT_CURSOR_HEADER}`)
      c.header(LINK_HEADER, `<${nextUrl.toString()}>; rel="next"`)
      c.header(NEXT_CURSOR_HEADER, payload.cursor)
    }

    return c.json(withToolPresentationOnMessages(payload.items, directoryResult.directory))
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}
