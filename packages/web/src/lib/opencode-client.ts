import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "./server-client"

export function getOpenCodeClient(directory: string) {
  const auth = authorizationHeader()
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)

  return createOpencodeClient({
    baseUrl,
    directory,
    headers: auth
      ? {
          authorization: auth,
        }
      : undefined,
    fetch: transport,
  })
}
