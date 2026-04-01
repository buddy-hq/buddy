import type { Context } from "hono"
import { ensureAllowedDirectory } from "../../http"
import { normalizeErrorResponse } from "../../http"
import { fetchOpenCode } from "../../http"

export async function abortSessionRun(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
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
