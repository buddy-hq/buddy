import type { Context } from "hono"
import { isJsonContentType, safeReadJson } from "../../http"
import { ensureAllowedDirectory } from "../../http"
import { normalizeErrorResponse } from "../../http"
import { fetchOpenCode, proxyToOpenCode } from "../../http"
import { isSessionInRequestedProject } from "../../http"
import { ensureSessionExistsInDirectory } from "./lookup"

export async function proxySessionCollection(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: "/session",
  })
}

export async function getSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: "GET",
    path: `/session/${encodeURIComponent(sessionID)}`,
    query: new URL(c.req.url).search,
    headers: new Headers(c.req.raw.headers),
  })

  const normalized = await normalizeErrorResponse(response)
  if (!normalized.ok) return normalized
  if (!isJsonContentType(normalized.headers.get("content-type"))) return normalized

  const session = await safeReadJson(normalized, { clone: true })
  const matchesProject = await isSessionInRequestedProject(directoryResult.directory, session)
  if (!matchesProject) {
    return c.json({ error: "Session not found" }, 404)
  }

  return normalized
}

export async function patchSessionById(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureSessionExistsInDirectory({
    directory: directoryResult.directory,
    sessionID,
    request: c.req.raw,
  })
  if (lookupResponse) return lookupResponse

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}`,
  })
}

export async function listSessionMessages(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const lookupResponse = await ensureSessionExistsInDirectory({
    directory: directoryResult.directory,
    sessionID,
    request: c.req.raw,
  })
  if (lookupResponse) return lookupResponse

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
  })
}
