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
import {
  ensureRuntimeSessionExists,
  loadRuntimeSessionInDirectory,
  runtimeSessionLookupErrorResponse,
} from "./lookup"

type SessionMessagesQuery = {
  limit?: number
  before?: string
}

type SessionPatchBody = {
  title?: unknown
  permission?: PermissionRuleset
  time?: {
    archived?: unknown
  }
}

type SessionSummarizeBody = {
  providerID?: unknown
  modelID?: unknown
  auto?: unknown
}

const SESSION_NOT_FOUND_ERROR = "Session not found"
const NOT_FOUND_STATUS = 404
const LINK_HEADER = "Link"
const NEXT_CURSOR_HEADER = "X-Next-Cursor"
const EXPOSE_HEADERS_HEADER = "Access-Control-Expose-Headers"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseSessionPatchBody(value: unknown): SessionPatchBody | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return value
}

function parseSessionSummarizeBody(value: unknown): SessionSummarizeBody | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return value
}

function readValidatedJsonBody(c: Context): unknown {
  const request: unknown = c.req
  if (!request || typeof request !== "object" || !("valid" in request)) {
    return undefined
  }

  const { valid } = request
  if (typeof valid !== "function") {
    return undefined
  }

  return Reflect.apply(valid, request, ["json"])
}

function readSessionMessagesQuery(c: Context): SessionMessagesQuery {
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

function buildSessionCreateParams(directory: string, body: Record<string, unknown>) {
  const { directory: _directory, workspace: _workspace, sessionID: _sessionID, ...rest } = body
  return {
    directory,
    ...rest,
  }
}

function buildSessionUpdateParams(input: {
  sessionID: string
  directory: string
  body: SessionPatchBody | undefined
}) {
  const params = {
    sessionID: input.sessionID,
    directory: input.directory,
  } satisfies {
    sessionID: string
    directory: string
    title?: string
    permission?: PermissionRuleset
    time?: { archived?: number }
  }

  if (typeof input.body?.title === "string") {
    params.title = input.body.title
  }
  if (input.body?.permission !== undefined) {
    params.permission = input.body.permission
  }
  if (isRecord(input.body?.time)) {
    const archived = input.body.time.archived
    if (typeof archived === "number") {
      params.time = { archived }
    }
  }

  return params
}

function buildSessionSummarizeParams(input: {
  sessionID: string
  directory: string
  body: SessionSummarizeBody | undefined
}) {
  const params = {
    sessionID: input.sessionID,
    directory: input.directory,
  } satisfies {
    sessionID: string
    directory: string
    providerID?: string
    modelID?: string
    auto?: boolean
  }

  if (typeof input.body?.providerID === "string") {
    params.providerID = input.body.providerID
  }
  if (typeof input.body?.modelID === "string") {
    params.modelID = input.body.modelID
  }
  if (typeof input.body?.auto === "boolean") {
    params.auto = input.body.auto
  }

  return params
}

export async function proxySessionCollection(c: Context): Promise<Response> {
  if (c.req.method === "POST") {
    const syncResult = await withConfigSync(c, {
      operation: "session creation",
    })
    if (!syncResult.ok) return syncResult.response

    const rawBody = readValidatedJsonBody(c)
    const body = isRecord(rawBody) ? rawBody : {}
    const client = await getOpenCodeClient(syncResult.value.directory)
    const result = await client.session.create(
      buildSessionCreateParams(syncResult.value.directory, body),
    )

    if (result.error) {
      return sdkErrorResponse(result)
    }

    const session = result.data
    if (session?.id) {
      runLearnerMemoryStartupPipeline({
        directory: syncResult.value.directory,
        currentSessionID: session.id,
      }).catch((error) => {
        console.warn("Learner memory startup pipeline failed:", error)
      })
    }

    return Response.json(session)
  }

  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const client = await getOpenCodeClient(directoryResult.directory)
  const result = await client.session.list({
    ...buildSessionListParams(c),
  })

  if (result.error) {
    return sdkErrorResponse(result)
  }

  return Response.json(result.data)
}

export async function getSessionStatus(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const client = await getOpenCodeClient(directoryResult.directory)
  const result = await client.session.status({
    directory: directoryResult.directory,
  })

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
  const result = await client.session.delete({
    sessionID,
    directory: directoryResult.directory,
  })

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

  const body = parseSessionPatchBody(readValidatedJsonBody(c))
  const client = await getOpenCodeClient(directoryResult.directory)
  const result = await client.session.update(
    buildSessionUpdateParams({
      sessionID,
      directory: directoryResult.directory,
      body,
    }),
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

  const body = parseSessionSummarizeBody(readValidatedJsonBody(c))
  const client = await getOpenCodeClient(syncResult.value.directory)
  const result = await client.session.summarize(
    buildSessionSummarizeParams({
      sessionID,
      directory: syncResult.value.directory,
      body,
    }),
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
  const rawBody = readValidatedJsonBody(c)
  const body = isRecord(rawBody) ? rawBody : {}
  const result = await client.session.revert({
    sessionID,
    directory: syncResult.value.directory,
    ...(typeof body.messageID === "string" ? { messageID: body.messageID } : {}),
    ...(typeof body.partID === "string" ? { partID: body.partID } : {}),
  })

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
  const rawBody = readValidatedJsonBody(c)
  const body = isRecord(rawBody) ? rawBody : {}
  const result = await client.session.fork({
    sessionID,
    directory: syncResult.value.directory,
    ...(typeof body.messageID === "string" ? { messageID: body.messageID } : {}),
  })

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
  const result = await client.session.unrevert({
    sessionID,
    directory: syncResult.value.directory,
  })

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
            cursor: undefined as string | undefined,
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
