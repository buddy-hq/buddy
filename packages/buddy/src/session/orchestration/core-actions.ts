import type { Context } from "hono"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { MessageV2 as OpenCodeMessage } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { ensureAllowedDirectory } from "../../http"
import { proxyToOpenCode } from "../../http"
import { isSessionInRequestedProject } from "../../http"
import { withConfigSync } from "../../http/route-helpers"
import { runLearnerMemoryStartupPipeline } from "../../learning/features/memory"
import { clearDynamicLearningToolsForEndedSession } from "../../learning/runtime/dynamic-tool-grants"
import { isSessionNotFoundError } from "./lookup"

type RuntimeSessionInfo = Awaited<ReturnType<typeof OpenCodeSession.get>>

type SessionMessagesQuery = {
  limit?: number
  before?: string
}

type OpenCodeErrorPayload = {
  message?: unknown
  data?: {
    message?: unknown
  }
}

type SessionPatchBody = {
  time?: {
    archived?: unknown
  }
}

const SESSION_NOT_FOUND_ERROR = "Session not found"
const REQUEST_FAILED_ERROR = "Request failed"
const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const SESSION_STATUS_PATH = "/session/status"
const LINK_HEADER = "Link"
const NEXT_CURSOR_HEADER = "X-Next-Cursor"
const EXPOSE_HEADERS_HEADER = "Access-Control-Expose-Headers"
const SESSION_REVERT_PATH_SUFFIX = "/revert"
const SESSION_UNREVERT_PATH_SUFFIX = "/unrevert"

function readOpenCodeErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const payload = error as OpenCodeErrorPayload
  if (typeof payload.data?.message === "string" && payload.data.message) {
    return payload.data.message
  }
  if (typeof payload.message === "string" && payload.message) {
    return payload.message
  }
  return undefined
}

function runtimeErrorResponse(error: unknown) {
  const message = isSessionNotFoundError(error)
    ? SESSION_NOT_FOUND_ERROR
    : (readOpenCodeErrorMessage(error) ?? REQUEST_FAILED_ERROR)
  const status = isSessionNotFoundError(error) ? NOT_FOUND_STATUS : BAD_REQUEST_STATUS
  return Response.json({ error: message }, { status })
}

function parseSessionPatchBody(value: unknown): SessionPatchBody | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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

async function isSessionListedInDirectory(directory: string, sessionID: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const sessions = await OpenCodeSession.list({ directory })
      return sessions.some((entry) => entry.id === sessionID)
    },
  })
}

async function loadSessionInDirectory(
  directory: string,
  sessionID: string,
): Promise<RuntimeSessionInfo | undefined> {
  const runtimeSessionID = SessionID.make(sessionID)

  try {
    const session = await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeSession.get(runtimeSessionID),
    })

    const matchesProject = await isSessionInRequestedProject(directory, session)
    if (matchesProject) {
      return session
    }

    const listedInDirectory = await isSessionListedInDirectory(directory, sessionID)
    return listedInDirectory ? session : undefined
  } catch (error) {
    if (isSessionNotFoundError(error)) {
      return undefined
    }
    throw error
  }
}

async function ensureRuntimeSessionExists(
  directory: string,
  sessionID: string,
): Promise<Response | undefined> {
  try {
    const session = await loadSessionInDirectory(directory, sessionID)
    if (!session) {
      return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: NOT_FOUND_STATUS })
    }
    return undefined
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function proxySessionCollection(c: Context): Promise<Response> {
  let sessionCreationDirectory: string | undefined
  if (c.req.method === "POST") {
    const syncResult = await withConfigSync(c, {
      operation: "session creation",
    })
    if (!syncResult.ok) return syncResult.response
    sessionCreationDirectory = syncResult.value.directory
  }

  const response = await proxyToOpenCode(c, {
    targetPath: "/session",
  })
  if (c.req.method === "POST" && response.ok && sessionCreationDirectory) {
    response
      .clone()
      .json()
      .then((body: unknown) => {
        const parsed = OpenCodeSession.Info.safeParse(body)
        if (!parsed.success) return
        runLearnerMemoryStartupPipeline({
          directory: sessionCreationDirectory,
          currentSessionID: parsed.data.id,
        }).catch((error) => {
          console.warn("Learner memory startup pipeline failed:", error)
        })
      })
      .catch(() => undefined)
  }
  return response
}

export async function getSessionStatus(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: SESSION_STATUS_PATH,
  })
}

export async function getSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  try {
    const session = await loadSessionInDirectory(directoryResult.directory, sessionID)
    if (!session) {
      return c.json({ error: SESSION_NOT_FOUND_ERROR }, NOT_FOUND_STATUS)
    }
    return c.json(session)
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function patchSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(directoryResult.directory, sessionID)
  if (lookupResponse) return lookupResponse

  const body = parseSessionPatchBody(readValidatedJsonBody(c))
  const response = await proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}`,
  })
  if (body?.time?.archived !== undefined && response.ok) {
    try {
      await clearDynamicLearningToolsForEndedSession({
        directory: directoryResult.directory,
        sessionID,
      })
    } catch (error) {
      console.warn("Failed to clear dynamic learning tools after archiving session", error)
    }
  }

  return response
}

export async function summarizeSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session compaction",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}/summarize`,
    forceBusyAs409: true,
  })
}

export async function revertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session revert",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}${SESSION_REVERT_PATH_SUFFIX}`,
    forceBusyAs409: true,
  })
}

export async function unrevertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session unrevert",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureRuntimeSessionExists(syncResult.value.directory, sessionID)
  if (lookupResponse) return lookupResponse

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}${SESSION_UNREVERT_PATH_SUFFIX}`,
    forceBusyAs409: true,
  })
}

export async function listSessionMessages(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const query = readSessionMessagesQuery(c)

  try {
    const session = await loadSessionInDirectory(directoryResult.directory, sessionID)
    if (!session) {
      return c.json({ error: SESSION_NOT_FOUND_ERROR }, NOT_FOUND_STATUS)
    }

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

    return c.json(payload.items)
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
