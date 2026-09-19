// This module is bundled into a sandboxed preload. Keep it dependency-free:
// sandboxed Electron preloads cannot require Rollup's relative shared chunks.
const IN_APP_BROWSER_BLANK_URL = "about:blank"
const IN_APP_BROWSER_URL_MAX_LENGTH = 8_192
const IN_APP_BROWSER_ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

/** IPC channel used when the guest preload blocks an unsafe page link. */
export const IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL = "inapp-browser-navigation-blocked" as const

type BrowserActivationEvent = {
  readonly isTrusted: boolean
  composedPath(): readonly InAppBrowserActivationPathTarget[]
  preventDefault(): void
  stopImmediatePropagation(): void
}

export type InAppBrowserActivationPathTarget = {
  readonly baseURI?: string
  readonly localName?: string
  getAttribute?(name: "href"): string | null
}

type BrowserActivationListener = (event: BrowserActivationEvent) => void

type BrowserActivationTarget = {
  addEventListener(
    type: "click" | "auxclick",
    listener: BrowserActivationListener,
    capture: true,
  ): void
  removeEventListener(
    type: "click" | "auxclick",
    listener: BrowserActivationListener,
    capture: true,
  ): void
}

function readLinkUrl(value: InAppBrowserActivationPathTarget): string | undefined {
  try {
    if (value.localName !== "a" && value.localName !== "area") return undefined
    const href = value.getAttribute?.("href")
    if (href === undefined || href === null) return undefined
    return new URL(href, value.baseURI).href
  } catch {
    return undefined
  }
}

function activatedLinkUrl(event: BrowserActivationEvent): string | undefined {
  for (const value of event.composedPath()) {
    const url = readLinkUrl(value)
    if (url !== undefined) return url
  }
  return undefined
}

function isAllowedInAppBrowserBlobUrl(url: string): boolean {
  if (url.length > IN_APP_BROWSER_URL_MAX_LENGTH) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "blob:" || parsed.href.length > IN_APP_BROWSER_URL_MAX_LENGTH) {
      return false
    }
    const embedded = new URL(parsed.pathname)
    return isAllowedHttpUrl(embedded.href) && embedded.pathname.length > 1
  } catch {
    return false
  }
}

function isAllowedHttpUrl(url: string): boolean {
  if (url.length > IN_APP_BROWSER_URL_MAX_LENGTH) return false
  try {
    return IN_APP_BROWSER_ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** Return whether a URL may load inside an in-app Browser guest. */
export function isSafeInAppBrowserNavigationUrl(url: string): boolean {
  if (url === IN_APP_BROWSER_BLANK_URL) return true
  if (isAllowedHttpUrl(url)) return true
  return isAllowedInAppBrowserBlobUrl(url)
}

/**
 * Block unsafe anchor and area activations before Chromium can execute schemes
 * such as `javascript:` without emitting an Electron navigation event.
 */
export function installInAppBrowserPageNavigationGuard(
  target: BrowserActivationTarget,
  onBlocked: () => void,
): () => void {
  const guard = (event: BrowserActivationEvent) => {
    const url = activatedLinkUrl(event)
    if (url === undefined || isSafeInAppBrowserNavigationUrl(url)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.isTrusted) onBlocked()
  }

  target.addEventListener("click", guard, true)
  target.addEventListener("auxclick", guard, true)
  return () => {
    target.removeEventListener("click", guard, true)
    target.removeEventListener("auxclick", guard, true)
  }
}
