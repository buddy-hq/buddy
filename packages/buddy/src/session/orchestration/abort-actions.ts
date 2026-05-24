import type { Context } from "hono"
import { ensureAllowedDirectory } from "../../http"
import { respondWithSdkResult } from "../../http/sdk-response"
import { getOpenCodeClient } from "../../opencode-runtime/client"

export async function abortSessionRun(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const client = await getOpenCodeClient(directoryResult.directory)
  const result = await client.session.abort({
    sessionID,
    directory: directoryResult.directory,
  })

  if (result.error) {
    return respondWithSdkResult(c, result)
  }

  return c.json(true)
}
