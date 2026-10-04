import {
  IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH,
  IN_APP_BROWSER_URL_MAX_LENGTH,
} from "@buddy/browser-contract"

const NON_PUBLIC_FAVICON_HOST_SUFFIXES = [
  "localhost",
  "local",
  "home.arpa",
  "ts.net",
  "alt",
  "example",
  "internal",
  "invalid",
  "onion",
  "test",
  "lan",
  "home",
  "corp",
] as const

function publicFaviconHostname(hostname: string): string | undefined {
  const normalized = hostname.replace(/\.$/u, "")
  // IP literals are deliberately excluded, including URL-normalized numeric loopback aliases.
  if (normalized.includes(":") || /^(?:\d+\.){3}\d+$/u.test(normalized)) return undefined
  const labels = normalized.split(".")
  if (
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) ||
    NON_PUBLIC_FAVICON_HOST_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
    )
  ) {
    return undefined
  }
  return normalized
}

/**
 * Google S2 favicon URL for a public DNS website, without disclosing its path or credentials.
 * Local/reserved names and all IP literals use the caller's fallback instead.
 *
 * @param rawUrl - Untrusted HTTP(S) page URL.
 * @returns The public-host favicon lookup URL, or `undefined` for an ineligible address.
 */
export function publicWebsiteFaviconUrl(rawUrl: string): string | undefined {
  if (rawUrl.length === 0 || rawUrl.length > IN_APP_BROWSER_URL_MAX_LENGTH) return undefined
  try {
    const pageUrl = new URL(rawUrl)
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return undefined
    const hostname = publicFaviconHostname(pageUrl.hostname)
    if (!hostname) return undefined
    const host = pageUrl.port ? `${hostname}:${pageUrl.port}` : hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return undefined
  }
}

/**
 * Conventional same-origin `/favicon.ico` URL for an untrusted http(s) page address.
 *
 * Path, query, hash, and credentials are discarded so the request stays on the
 * page origin and never carries embedded userinfo.
 *
 * @param rawUrl - Untrusted page URL, including a live redirected document URL.
 * @returns The origin favicon URL, or `undefined` when the input is not a bounded http(s) URL.
 */
export function inAppBrowserOriginFaviconUrl(rawUrl: string): string | undefined {
  if (rawUrl.length === 0 || rawUrl.length > IN_APP_BROWSER_URL_MAX_LENGTH) return undefined
  try {
    const pageUrl = new URL(rawUrl)
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return undefined
    const faviconUrl = new URL("/favicon.ico", pageUrl.origin)
    return faviconUrl.href.length <= IN_APP_BROWSER_URL_MAX_LENGTH ? faviconUrl.href : undefined
  } catch {
    return undefined
  }
}

function capturedFaviconDataUrl(value: string | null): string | undefined {
  if (
    !value ||
    value.length > IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH ||
    !value.startsWith("data:image/")
  ) {
    return undefined
  }
  return value
}

/**
 * Favicon image sources to try in order for a Browser tab or recent page.
 *
 * @param input.capturedDataUrl - Guest-captured raster, if any.
 * @param input.pageUrl - Live page URL. Redirects must pass the committed document URL, not the typed address.
 * @returns The captured data URL first, then the page origin `/favicon.ico`, omitting unusable values.
 */
export function inAppBrowserFaviconImageSources(input: {
  readonly capturedDataUrl: string | null
  readonly pageUrl: string | null
}): readonly string[] {
  const sources: string[] = []
  const captured = capturedFaviconDataUrl(input.capturedDataUrl)
  if (captured) sources.push(captured)
  const originFavicon = input.pageUrl ? inAppBrowserOriginFaviconUrl(input.pageUrl) : undefined
  if (originFavicon) sources.push(originFavicon)
  return sources
}
