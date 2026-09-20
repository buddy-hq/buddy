import { IN_APP_BROWSER_URL_MAX_LENGTH, normalizeInAppBrowserUrl } from "@buddy/browser-contract"

/** Search providers available to the in-app Browser. */
export const IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS = [
  { id: "duckduckgo", label: "DuckDuckGo", endpoint: "https://duckduckgo.com/" },
  { id: "google", label: "Google", endpoint: "https://www.google.com/search" },
] as const

/** Stable identifier for an in-app Browser search provider. */
export type InAppBrowserSearchEngine = (typeof IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS)[number]["id"]

/** Search provider used until the user chooses another provider. */
export const DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE: InAppBrowserSearchEngine = "google"

/** Successfully resolved user input. */
export type ResolvedInAppBrowserInput = {
  readonly _tag: "resolved"
  readonly kind: "url" | "search"
  readonly url: string
}

/** Expected reason that Browser input cannot be resolved safely. */
export type RejectedInAppBrowserInput = {
  readonly _tag: "rejected"
  readonly reason: "empty" | "invalid-address" | "too-long" | "unsupported-protocol"
}

/** Outcome of interpreting user-entered Browser text. */
export type InAppBrowserInputResolution = ResolvedInAppBrowserInput | RejectedInAppBrowserInput

const SEARCH_OPERATOR_PREFIXES = new Set([
  "after",
  "allintext",
  "allintitle",
  "allinurl",
  "before",
  "cache",
  "define",
  "ext",
  "filetype",
  "intext",
  "intitle",
  "inurl",
  "related",
  "site",
])

const KNOWN_UNSUPPORTED_PROTOCOLS = new Set([
  "about",
  "blob",
  "data",
  "file",
  "ftp",
  "javascript",
  "mailto",
  "sms",
  "tel",
  "vbscript",
])

function isProtocolControlCodeUnit(codeUnit: number): boolean {
  return (
    codeUnit <= 0x1f ||
    (codeUnit >= 0x7f && codeUnit <= 0x9f) ||
    codeUnit === 0xad ||
    codeUnit === 0x61c ||
    (codeUnit >= 0x200b && codeUnit <= 0x200f) ||
    (codeUnit >= 0x202a && codeUnit <= 0x202e) ||
    (codeUnit >= 0x2060 && codeUnit <= 0x206f) ||
    codeUnit === 0xfeff
  )
}

function trimLeadingProtocolControlCharacters(value: string): string {
  let start = 0
  while (start < value.length && isProtocolControlCodeUnit(value.charCodeAt(start))) start += 1
  return value.slice(start)
}

function searchEngineOption(engine: InAppBrowserSearchEngine) {
  return IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS.find((option) => option.id === engine)
}

function explicitProtocol(value: string): string | undefined {
  const protocolCandidate = trimLeadingProtocolControlCharacters(value)
  const match = /^([a-z][a-z\d+.-]*):(.*)/isu.exec(protocolCandidate)
  if (!match) return undefined
  const protocol = match[1]?.toLowerCase()
  if (!protocol || SEARCH_OPERATOR_PREFIXES.has(protocol)) return undefined
  const remainder = match[2] ?? ""
  if (protocol === "http" || protocol === "https" || KNOWN_UNSUPPORTED_PROTOCOLS.has(protocol)) {
    return protocol
  }
  // A numeric suffix is a bare host port (for example localhost:3000), not a URL scheme.
  if (/^\d+(?:[/?#]|$)/u.test(remainder)) return undefined
  // URI schemes cannot contain raw whitespace. Treat an unknown `word: phrase` prefix as query
  // punctuation while the explicit blocked protocols above remain blocked regardless of spacing.
  if (/\s/u.test(remainder)) return undefined
  return protocol
}

function hasSearchOperatorPrefix(value: string): boolean {
  const match = /^([a-z][a-z\d+.-]*):/iu.exec(value)
  return SEARCH_OPERATOR_PREFIXES.has(match?.[1]?.toLowerCase() ?? "")
}

function looksLikeEmailAddress(value: string): boolean {
  const atIndex = value.indexOf("@")
  if (atIndex < 0) return false
  const addressDelimiterIndex = value.search(/[/?#]/u)
  return addressDelimiterIndex < 0 || atIndex < addressDelimiterIndex
}

function bareAddressHostname(value: string): string {
  const authority = value.split(/[/?#]/u, 1)[0] ?? value
  if (authority.startsWith("[")) return authority
  return authority.replace(/:\d+$/u, "")
}

function looksLikeIpv4Shorthand(value: string): boolean {
  const hostname = bareAddressHostname(value)
  if (!/^\d+(?:\.\d+)*$/u.test(hostname)) return false
  const octets = hostname.split(".")
  return octets.length !== 4 || octets.some((octet) => Number(octet) > 255)
}

function looksLikeAcronymPathQuery(value: string): boolean {
  const authority = value.split(/[/?#]/u, 1)[0] ?? value
  if (/:\d+$/u.test(authority)) return false
  return /^[A-Z][A-Z\d.+-]*\/[A-Z][A-Z\d.+-]*(?:[/?#]|$)/u.test(value)
}

function looksLikeBareAddress(value: string, normalizedUrl: string): boolean {
  if (
    /\s/u.test(value) ||
    looksLikeEmailAddress(value) ||
    looksLikeIpv4Shorthand(value) ||
    looksLikeAcronymPathQuery(value)
  ) {
    return false
  }
  try {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase().replace(/^\[|\]$/gu, "")
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.includes(".") ||
      hostname.includes(":") ||
      /^[^/:?#]+:\d+(?:[/?#]|$)/u.test(value) ||
      /^[^/?#]+[/?#]/u.test(value)
    )
  } catch {
    return false
  }
}

function searchUrl(query: string, engine: InAppBrowserSearchEngine): string | undefined {
  const option = searchEngineOption(engine)
  if (!option) return undefined
  const url = new URL(option.endpoint)
  url.searchParams.set("q", query)
  return url.href.length <= IN_APP_BROWSER_URL_MAX_LENGTH ? url.href : undefined
}

/** Parse an untrusted persisted value into a supported Browser search provider. */
export function parseInAppBrowserSearchEngine<TValue>(
  value: TValue,
): InAppBrowserSearchEngine | undefined {
  return IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS.find((option) => option.id === value)?.id
}

/** Return the user-facing label for a Browser search provider. */
export function inAppBrowserSearchEngineLabel(engine: InAppBrowserSearchEngine): string {
  return searchEngineOption(engine)?.label ?? "Search"
}

/**
 * Interpret user-entered Browser text as either a safe HTTP(S) address or a search query.
 * Known URLs retain the Browser contract's localhost behavior; unsupported schemes never leak to
 * a search provider.
 */
export function resolveInAppBrowserInput(
  input: string,
  engine: InAppBrowserSearchEngine,
): InAppBrowserInputResolution {
  const value = input.trim()
  if (!value) return { _tag: "rejected", reason: "empty" }
  if (value.length > IN_APP_BROWSER_URL_MAX_LENGTH) {
    return { _tag: "rejected", reason: "too-long" }
  }

  const protocol = explicitProtocol(value)
  if (protocol) {
    if (protocol !== "http" && protocol !== "https") {
      return { _tag: "rejected", reason: "unsupported-protocol" }
    }
    const url = normalizeInAppBrowserUrl(value)
    return url
      ? { _tag: "resolved", kind: "url", url }
      : { _tag: "rejected", reason: "invalid-address" }
  }

  if (hasSearchOperatorPrefix(value)) {
    const url = searchUrl(value, engine)
    return url
      ? { _tag: "resolved", kind: "search", url }
      : { _tag: "rejected", reason: "too-long" }
  }

  const normalizedUrl = normalizeInAppBrowserUrl(value)
  if (normalizedUrl && looksLikeBareAddress(value, normalizedUrl)) {
    return { _tag: "resolved", kind: "url", url: normalizedUrl }
  }

  const url = searchUrl(value, engine)
  return url ? { _tag: "resolved", kind: "search", url } : { _tag: "rejected", reason: "too-long" }
}
