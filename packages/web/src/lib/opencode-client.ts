import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { getPlatform } from "../context/platform"
import { getServerConnection } from "../context/server"

function resolveOpencodeBaseUrl() {
  const server = getServerConnection()
  const base = server.url || window.location.origin
  return `${base.replace(/\/+$/, "")}/api`
}

function authorizationHeader() {
  const server = getServerConnection()
  if (!server.username || !server.password) return undefined
  return `Basic ${btoa(`${server.username}:${server.password}`)}`
}

export function getOpenCodeClient(directory: string) {
  const auth = authorizationHeader()
  const transport = getPlatform().fetch ?? fetch

  return createOpencodeClient({
    baseUrl: resolveOpencodeBaseUrl(),
    directory,
    headers: auth
      ? {
          authorization: auth,
        }
      : undefined,
    fetch: async (input, init) => transport(input, init),
  })
}
