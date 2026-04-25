import { applyAuthToUrl, resolveServerEndpoint } from "./server-client"

export function resolveAssetUrl(endpoint: string) {
  const resolved = resolveServerEndpoint(endpoint)
  const url = new URL(resolved, window.location.origin)
  applyAuthToUrl(url)
  return url.toString()
}
