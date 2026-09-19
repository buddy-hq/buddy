import {
  IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH,
  IN_APP_BROWSER_URL_MAX_LENGTH,
} from "@buddy/browser-contract"

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
