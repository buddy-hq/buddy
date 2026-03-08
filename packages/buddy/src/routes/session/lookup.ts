import { isJsonContentType, safeReadJson } from "../shared/http.js"
import { isSessionInRequestedProject } from "../support/session.js"
import { normalizeErrorResponse } from "../support/error-normalization.js"
import { fetchOpenCode } from "../support/proxy.js"
import { SessionLookupError } from "./errors.js"

type OpenCodeNotFoundError = {
  name?: unknown
  message?: unknown
  data?: {
    message?: unknown
  }
}

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
    return Response.json({ error: "Session not found" }, { status: 404 })
  }

  const matchesProject = await isSessionInRequestedProject(input.directory, session)
  if (!matchesProject) {
    return Response.json({ error: "Session not found" }, { status: 404 })
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
