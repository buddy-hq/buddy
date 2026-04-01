import { isJsonContentType, safeReadJson } from "../../http"
import { isSessionInRequestedProject } from "../../http"
import { normalizeErrorResponse } from "../../http"
import { fetchOpenCode } from "../../http"
import { SessionLookupError } from "./errors"

type OpenCodeNotFoundError = {
  name?: unknown
  message?: unknown
  data?: {
    message?: unknown
  }
}

type SessionListEntry = {
  id?: unknown
}

const SESSION_NOT_FOUND_ERROR = "Session not found"
const SESSION_COLLECTION_PATH = "/session"

function readSessionNotFoundMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const payload = error as OpenCodeNotFoundError
  const fromData = payload.data?.message
  if (typeof fromData === "string") return fromData
  if (typeof payload.message === "string") return payload.message
  return undefined
}

export function isSessionNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const errorName = "name" in error ? (error as OpenCodeNotFoundError).name : undefined
  if (errorName !== "NotFoundError") return false

  const message = readSessionNotFoundMessage(error)
  return typeof message === "string" && message.startsWith("Session not found:")
}

function hasSessionId(value: unknown, sessionID: string): value is SessionListEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return (value as SessionListEntry).id === sessionID
}

async function isSessionListedInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<boolean> {
  const query = new URLSearchParams({
    directory: input.directory,
  }).toString()

  const response = await fetchOpenCode({
    directory: input.directory,
    method: "GET",
    path: SESSION_COLLECTION_PATH,
    query,
    headers: new Headers(input.request.headers),
  })
  const normalized = await normalizeErrorResponse(response)
  if (!normalized.ok) return false
  if (!isJsonContentType(normalized.headers.get("content-type"))) return false

  const sessions = await safeReadJson(normalized)
  if (!Array.isArray(sessions)) return false
  return sessions.some((entry) => hasSessionId(entry, input.sessionID))
}

export async function ensureSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  const response = await fetchOpenCode({
    directory: input.directory,
    method: "GET",
    path: `/session/${encodeURIComponent(input.sessionID)}`,
    headers: new Headers(input.request.headers),
  })
  const normalized = await normalizeErrorResponse(response)
  if (!normalized.ok) return normalized
  if (!isJsonContentType(normalized.headers.get("content-type"))) return undefined

  const session = await safeReadJson(normalized)
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
  }

  const matchesProject = await isSessionInRequestedProject(input.directory, session)
  if (!matchesProject) {
    const listedInDirectory = await isSessionListedInDirectory(input)
    if (listedInDirectory) {
      return undefined
    }

    return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
  }

  return undefined
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
