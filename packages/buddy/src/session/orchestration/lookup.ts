import { piRuntime, PiSessionNotFoundError } from "../../pi-backend/runtime"
import { SessionLookupError } from "./errors"

const SESSION_NOT_FOUND_ERROR = "Session not found"

export function isSessionNotFoundError(error: unknown): boolean {
  return error instanceof PiSessionNotFoundError
}

export async function ensureSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  try {
    await piRuntime.getSessionInfo(input.directory, input.sessionID)
    return undefined
  } catch (error) {
    if (isSessionNotFoundError(error)) {
      return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
    }
    throw error
  }
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
