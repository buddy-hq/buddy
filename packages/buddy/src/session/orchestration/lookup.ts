import type { Session } from "@buddy/transcript-contract/session"
import { isNotFound, runtimeErrorStatus } from "@buddy/agent-runtime/errors"
import { isSessionInRequestedProject } from "../../http/session"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { SessionLookupError } from "./errors"

export type RuntimeSessionInfo = Session

const SESSION_NOT_FOUND_ERROR = "Session not found"
const NOT_FOUND_STATUS = 404

export function isSessionNotFoundError(cause: unknown): boolean {
  return isNotFound(cause, "session")
}

export function runtimeSessionLookupErrorResponse(cause: unknown): Response {
  const status = runtimeErrorStatus(cause)
  const message = isNotFound(cause, "session")
    ? SESSION_NOT_FOUND_ERROR
    : cause instanceof Error
      ? cause.message
      : "Request failed"
  return Response.json({ error: message }, { status })
}

export async function loadRuntimeSessionInDirectory(
  directory: string,
  sessionID: string,
): Promise<RuntimeSessionInfo | undefined> {
  try {
    const session = await (await getAgentRuntime()).conversations.get(sessionID)
    return (await isSessionInRequestedProject(directory, session)) ? session : undefined
  } catch (error) {
    if (isNotFound(error, "session")) return undefined
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
