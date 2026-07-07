import { getServerConnection } from "@/context/server"
import { applyAuthToUrl, resolveServerEndpoint } from "./server-client"

function readWindowOrigin(): string | null {
  if (typeof window === "undefined") return null
  const origin = window.location.origin
  return origin && origin !== "null" ? origin : null
}

function shouldApplyAssetAuth(url: URL): boolean {
  const server = getServerConnection()
  if (server.isEmbeddedBackend || !server.username || !server.password) return false

  if (server.url) {
    return url.origin === new URL(server.url).origin
  }

  const origin = readWindowOrigin()
  return origin !== null && url.origin === origin
}

export function resolveAssetUrl(endpoint: string) {
  if (endpoint.startsWith("data:") || endpoint.startsWith("blob:")) {
    return endpoint
  }

  const resolved = resolveServerEndpoint(endpoint)
  if (!/^https?:\/\//.test(resolved)) {
    const origin = readWindowOrigin()
    if (origin === null) {
      return resolved
    }

    const url = new URL(resolved, origin)
    if (shouldApplyAssetAuth(url)) {
      applyAuthToUrl(url)
    }
    return url.toString()
  }

  const url = new URL(resolved)
  if (shouldApplyAssetAuth(url)) {
    applyAuthToUrl(url)
  }
  return url.toString()
}
