import type { Context } from "hono"
import { readTeachingSessionState } from "../../../agent-execution/state/session-state"
import { withConfigSync } from "../../../../http/route-helpers"

export async function getTeachingState(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "teaching-state",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const state = readTeachingSessionState(syncResult.value.directory, sessionID)
  if (!state) {
    return c.body(null, 204)
  }

  return c.json(state)
}
