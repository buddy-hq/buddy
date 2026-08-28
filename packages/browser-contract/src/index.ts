export const IN_APP_BROWSER_PARTITION = "persist:buddy-browser"
export const IN_APP_BROWSER_BLANK_URL = "about:blank"
export const IN_APP_BROWSER_NEW_TAB_TITLE = "New tab"
export const IN_APP_BROWSER_WEB_PREFERENCES =
  "contextIsolation=true,sandbox=true,nodeIntegration=false"
export const IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE = "Downloads are not supported yet."
export const IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE = "This link cannot open another app yet."
export const IN_APP_BROWSER_TITLE_MAX_LENGTH = 200
export const IN_APP_BROWSER_URL_MAX_LENGTH = 8_192
export const IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH = 8_192
export const IN_APP_BROWSER_MESSAGE_CHANNEL = "inapp-browser-message"
export const IN_APP_BROWSER_FAVICON_CHANNEL = "inapp-browser-favicon"

export type InAppBrowserFavicon = {
  dataUrl: string
  pageUrl: string
  capturedAt: number
}

export type InAppBrowserFaviconMessage = {
  webContentsID: number
  favicon: InAppBrowserFavicon
}

export type InAppBrowserHostMessage = {
  webContentsID: number
  message: string
}

const IN_APP_BROWSER_PROTOCOLS = new Set(["http:", "https:"])
const LOCAL_DEVELOPMENT_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::", "::1"])

function hasExplicitProtocol(value: string): boolean {
  const match = /^[a-z][a-z\d+.-]*:(.*)$/iu.exec(value)
  if (!match) return false
  const remainder = match[1] ?? ""
  if (remainder.startsWith("//")) return true
  return !/^\d+(?:[/?#]|$)/u.test(remainder)
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
}

function parseIpv4Address(hostname: string): readonly number[] | undefined {
  const parts = hostname.split(".").map(Number)
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : undefined
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  if (LOCAL_DEVELOPMENT_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")) {
    return true
  }
  return parseIpv4Address(normalized)?.[0] === 127
}

function bareAddressProtocol(value: string): "http" | "https" {
  try {
    const hostname = new URL(`http://${value}`).hostname
    return isLocalDevelopmentHostname(hostname) ? "http" : "https"
  } catch {
    return "https"
  }
}

export function normalizeInAppBrowserUrl(value: string): string | undefined {
  const address = value.trim()
  if (!address || address.length > IN_APP_BROWSER_URL_MAX_LENGTH) return undefined

  const candidate = hasExplicitProtocol(address)
    ? address
    : `${bareAddressProtocol(address)}://${address}`
  try {
    const url = new URL(candidate)
    return IN_APP_BROWSER_PROTOCOLS.has(url.protocol) &&
      url.href.length <= IN_APP_BROWSER_URL_MAX_LENGTH
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function isAllowedInAppBrowserUrl(value: string): boolean {
  if (value.length > IN_APP_BROWSER_URL_MAX_LENGTH) return false
  try {
    return IN_APP_BROWSER_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function isInAppBrowserTargetUrl(value: string): boolean {
  return value === IN_APP_BROWSER_BLANK_URL || isAllowedInAppBrowserUrl(value)
}

export function inAppBrowserFallbackTitle(url: string): string {
  if (!url || url === IN_APP_BROWSER_BLANK_URL) return IN_APP_BROWSER_NEW_TAB_TITLE
  try {
    return new URL(url).hostname || IN_APP_BROWSER_NEW_TAB_TITLE
  } catch {
    return IN_APP_BROWSER_NEW_TAB_TITLE
  }
}

export function normalizeInAppBrowserTitle(title: string, url: string): string {
  if (!url || url === IN_APP_BROWSER_BLANK_URL) return IN_APP_BROWSER_NEW_TAB_TITLE
  const normalized = title
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
  return (normalized || inAppBrowserFallbackTitle(url)).slice(0, IN_APP_BROWSER_TITLE_MAX_LENGTH)
}

export function inAppBrowserDisplayUrl(url: string): string {
  return url === IN_APP_BROWSER_BLANK_URL ? "" : url
}
