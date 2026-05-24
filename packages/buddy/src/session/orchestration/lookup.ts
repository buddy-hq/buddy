import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { isSessionInRequestedProject } from "../../http"
import { SessionLookupError } from "./errors"

type OpenCodeNotFoundError = {
  name?: unknown
  message?: unknown
  data?: {
    message?: unknown
  }
}

type OpenCodeErrorPayload = {
  message?: unknown
  data?: {
    message?: unknown
  }
}

export type RuntimeSessionInfo = Awaited<ReturnType<typeof OpenCodeSession.get>>

const SESSION_NOT_FOUND_ERROR = "Session not found"
const REQUEST_FAILED_ERROR = "Request failed"
const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404

function readSessionNotFoundMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const payload = error as OpenCodeNotFoundError
  const fromData = payload.data?.message
  if (typeof fromData === "string") return fromData
  if (typeof payload.message === "string") return payload.message
  return undefined
}

export function isSessionNotFoundError(error: unknown): boolean {
  if (typeof error === "string") {
    return error.startsWith("Session not found")
  }

  if (!error || typeof error !== "object") return false
  const errorName = "name" in error ? (error as OpenCodeNotFoundError).name : undefined
  if (errorName !== "NotFoundError") return false

  const message = readSessionNotFoundMessage(error)
  return typeof message === "string" && message.startsWith("Session not found:")
}

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

export function runtimeSessionLookupErrorResponse(error: unknown): Response {
  const message = isSessionNotFoundError(error)
    ? SESSION_NOT_FOUND_ERROR
    : (readOpenCodeErrorMessage(error) ?? REQUEST_FAILED_ERROR)
  const status = isSessionNotFoundError(error) ? NOT_FOUND_STATUS : BAD_REQUEST_STATUS
  return Response.json({ error: message }, { status })
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

export async function loadRuntimeSessionInDirectory(
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

export async function ensureRuntimeSessionExists(
  directory: string,
  sessionID: string,
): Promise<Response | undefined> {
  try {
    const session = await loadRuntimeSessionInDirectory(directory, sessionID)
    if (!session) {
      return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: NOT_FOUND_STATUS })
    }
    return undefined
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function ensureSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  return ensureRuntimeSessionExists(input.directory, input.sessionID)
}

export async function assertSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}) {
  const response = await ensureSessionExistsInDirectory(input)
  if (!response) return
  throw new SessionLookupError(response)
}
