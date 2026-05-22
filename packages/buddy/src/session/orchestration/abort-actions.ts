import type { Context } from "hono"
import { piAbortSessionRun } from "../../pi-backend/actions"

export async function abortSessionRun(c: Context): Promise<Response> {
  return piAbortSessionRun(c)
}
