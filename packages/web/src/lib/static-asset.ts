const ROOT_ASSET_PREFIX = "/"
const BUDDY_ICON_ASSET_PATH = "buddy-icon.png"

function normalizeAssetPath(path: string) {
  return path.replace(/^\/+/, "")
}

function readBuddyAssetBaseUrl() {
  const buddyGlobals = Reflect.get(window, "__BUDDY__")
  if (!buddyGlobals || typeof buddyGlobals !== "object") {
    return undefined
  }

  const assetBaseUrl = Reflect.get(buddyGlobals, "assetBaseUrl")
  if (typeof assetBaseUrl !== "string" || assetBaseUrl.length === 0) {
    return undefined
  }

  return assetBaseUrl
}

export function resolvePublicAssetUrl(path: string) {
  const normalizedPath = normalizeAssetPath(path)

  if (typeof window === "undefined") {
    return `${ROOT_ASSET_PREFIX}${normalizedPath}`
  }

  const assetBaseUrl = readBuddyAssetBaseUrl()
  if (assetBaseUrl) {
    try {
      return new URL(normalizedPath, assetBaseUrl).toString()
    } catch {
      // fallback below
    }
  }

  if (window.location.protocol === "file:") {
    try {
      return new URL(normalizedPath, window.location.href).toString()
    } catch {
      // fallback below
    }
  }

  return `${ROOT_ASSET_PREFIX}${normalizedPath}`
}

export function resolveBuddyIconUrl() {
  return resolvePublicAssetUrl(BUDDY_ICON_ASSET_PATH)
}
