import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"

const ROOT_ASSET_PREFIX = "/"
const BUDDY_ICON_ASSET_PATH = "buddy-icon.png"
const BUDDY_WINDOW_GLOBALS_KEY = "__BUDDY__"

function normalizeAssetPath(path: string) {
  return path.replace(/^\/+/, "")
}

function hasDomWindow(): boolean {
  return "window" in globalThis
}

function readBuddyAssetBaseUrl() {
  if (!hasDomWindow()) return undefined
  const buddyGlobals = parseTJsonObject(
    Object.getOwnPropertyDescriptor(window, BUDDY_WINDOW_GLOBALS_KEY)?.value,
  )
  return parseTString(buddyGlobals?.assetBaseUrl)
}

export function resolvePublicAssetUrl(path: string) {
  const normalizedPath = normalizeAssetPath(path)

  if (!hasDomWindow()) {
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
