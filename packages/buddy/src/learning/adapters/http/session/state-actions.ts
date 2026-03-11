import type { Context } from "hono"
import { readTeachingSessionState } from "../../../agent-execution/state/session-state"
import { ensureAllowedDirectory } from "../../../../http/directory"

export async function getTeachingState(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const state = readTeachingSessionState(directoryResult.directory, sessionID)
  if (!state) {
    return c.body(null, 204)
  }

  return c.json(state)
}
