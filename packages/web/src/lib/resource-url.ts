import { getServerConnection } from "@/context/server"
import { applyAuthToUrl, resolveServerEndpoint } from "./server-client"

export function resolveAssetUrl(endpoint: string) {
  const resolved = resolveServerEndpoint(endpoint)
  const server = getServerConnection()
  if (!/^https?:\/\//.test(resolved)) {
    const origin = window.location.origin
    if (!origin || origin === "null") {
      return resolved
    }

    const url = new URL(resolved, origin)
    if (!server.isEmbeddedBackend) {
      applyAuthToUrl(url)
    }
    return url.toString()
  }

  const url = new URL(resolved)
  if (!server.isEmbeddedBackend) {
    applyAuthToUrl(url)
  }
  return url.toString()
}
