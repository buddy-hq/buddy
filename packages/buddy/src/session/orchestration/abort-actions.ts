import type { Context } from "hono"
import { backgroundSession, interruptSession } from "@buddy/opencode-adapter/gateway/session"
import { ensureAllowedDirectory } from "../../http/directory"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { ensureRuntimeSessionExists, runtimeSessionLookupErrorResponse } from "./lookup"

export async function abortSessionRun(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  const missing = await ensureRuntimeSessionExists(allowed.directory, sessionID)
  if (missing) return missing
  try {
    return c.json(await interruptSession(await getOpenCodeClient(), sessionID))
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function backgroundSessionRun(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  const missing = await ensureRuntimeSessionExists(allowed.directory, sessionID)
  if (missing) return missing
  try {
    await backgroundSession(await getOpenCodeClient(), sessionID)
    return c.body(null, 204)
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}
