import type { Session } from "@buddy/transcript-contract/session"
import { getSession } from "@buddy/opencode-adapter/gateway/session"
import { isSessionNotFound, sessionErrorStatus } from "@buddy/opencode-adapter/gateway/errors"
import { isSessionInRequestedProject } from "../../http/session"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { SessionLookupError } from "./errors"

export type RuntimeSessionInfo = Session

const SESSION_NOT_FOUND_ERROR = "Session not found"
const NOT_FOUND_STATUS = 404

export const isSessionNotFoundError = isSessionNotFound

export function runtimeSessionLookupErrorResponse(cause: unknown): Response {
  const status = sessionErrorStatus(cause)
  const message = isSessionNotFound(cause) ? SESSION_NOT_FOUND_ERROR : cause instanceof Error ? cause.message : "Request failed"
  return Response.json({ error: message }, { status })
}

export async function loadRuntimeSessionInDirectory(directory: string, sessionID: string): Promise<RuntimeSessionInfo | undefined> {
  try {
    const session = await getSession(await getOpenCodeClient(), sessionID)
    return await isSessionInRequestedProject(directory, session) ? session : undefined
  } catch (error) {
    if (isSessionNotFound(error)) return undefined
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
