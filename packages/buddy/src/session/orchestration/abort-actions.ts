import type { Context } from "hono"
import { ensureAllowedDirectory } from "../../http"
import { normalizeErrorResponse } from "../../http"
import { fetchOpenCode } from "../../http"
import { loadSessionStatus } from "../../http"

export async function abortSessionRun(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const statuses = await loadSessionStatus(directoryResult.directory, c.req.raw)
  const current = statuses?.[sessionID]
  if (!current || current.type === "idle") {
    return c.json(false)
  }

  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: c.req.method.toUpperCase(),
    path: `/session/${encodeURIComponent(sessionID)}/abort`,
    headers: new Headers(c.req.raw.headers),
  })
  const normalized = await normalizeErrorResponse(response)

  if (!normalized.ok) return normalized
  return c.json(true)
}
