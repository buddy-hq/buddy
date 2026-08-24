import { IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH } from "@buddy/browser-contract"

export const IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES = 100_000
export const IN_APP_BROWSER_FAVICON_MAX_CANDIDATES = 8

const IN_APP_BROWSER_FAVICON_MAX_HTTP_URL_LENGTH = 2_048
const IN_APP_BROWSER_FAVICON_MAX_INLINE_URL_LENGTH =
  Math.ceil((IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES * 4) / 3) + 128
const IN_APP_BROWSER_FAVICON_CAPTURE_TIMEOUT_MS = 5_000
const IN_APP_BROWSER_FAVICON_MIN_CANDIDATE_INPUT_UNITS = 256
const IN_APP_BROWSER_FAVICON_MAX_CANDIDATE_INPUT_UNITS = 262_144

export type InAppBrowserFaviconRasterizer = (bytes: Uint8Array) => string | null

export type InAppBrowserFaviconFetcher = (
  url: string,
  init: RequestInit,
) => Promise<Response>

export function inAppBrowserSafeHttpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : null
  } catch {
    return null
  }
}

function isSupportedFaviconCandidate(candidate: string): boolean {
  if (candidate.length > IN_APP_BROWSER_FAVICON_MAX_INLINE_URL_LENGTH) return false
  if (/^data:/iu.test(candidate)) {
    return /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/iu.test(candidate)
  }
  try {
    const protocol = new URL(candidate).protocol
    return (
      (protocol === "http:" || protocol === "https:") &&
      candidate.length <= IN_APP_BROWSER_FAVICON_MAX_HTTP_URL_LENGTH
    )
  } catch {
    return false
  }
}

export function selectInAppBrowserFaviconCandidates(
  candidates: readonly string[],
): readonly string[] {
  const selected: string[] = []
  const seen = new Set<string>()
  let inputUnits = 0

  for (const candidate of candidates) {
    inputUnits += Math.max(
      IN_APP_BROWSER_FAVICON_MIN_CANDIDATE_INPUT_UNITS,
      candidate.length,
    )
    if (inputUnits > IN_APP_BROWSER_FAVICON_MAX_CANDIDATE_INPUT_UNITS) break
    if (!isSupportedFaviconCandidate(candidate) || seen.has(candidate)) continue
    seen.add(candidate)
    selected.push(candidate)
    if (selected.length === IN_APP_BROWSER_FAVICON_MAX_CANDIDATES) break
  }

  return selected
}

async function readBoundedFaviconResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const contentLength = Number(response.headers.get("content-length"))
  if (
    Number.isFinite(contentLength) &&
    contentLength > IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel()
    return null
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength <= IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES
      ? bytes
      : null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  const cancelForAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined)
  }
  signal.addEventListener("abort", cancelForAbort, { once: true })
  if (signal.aborted) cancelForAbort()

  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        const bytes = new Uint8Array(byteLength)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        return bytes
      }
      byteLength += next.value.byteLength
      if (byteLength > IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(next.value)
    }
  } finally {
    signal.removeEventListener("abort", cancelForAbort)
    reader.releaseLock()
  }
}

function normalizedFaviconMimeType(response: Response): string | null {
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (!mimeType) return null
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") return null
  return mimeType
}

export async function captureInAppBrowserFavicon(input: {
  pageUrl: string
  candidates: readonly string[]
  signal: AbortSignal
  fetchResponse: InAppBrowserFaviconFetcher
  rasterize: InAppBrowserFaviconRasterizer
}): Promise<string | null> {
  const pageOrigin = inAppBrowserSafeHttpOrigin(input.pageUrl)
  if (!pageOrigin) return null

  const timeout = AbortSignal.timeout(IN_APP_BROWSER_FAVICON_CAPTURE_TIMEOUT_MS)
  const signal = AbortSignal.any([input.signal, timeout])

  for (const candidate of selectInAppBrowserFaviconCandidates(input.candidates)) {
    if (signal.aborted) return null
    try {
      const candidateOrigin = inAppBrowserSafeHttpOrigin(candidate)
      const response = await input.fetchResponse(candidate, {
        credentials: candidateOrigin === pageOrigin ? "include" : "omit",
        redirect: "error",
        signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        continue
      }
      const bytes = await readBoundedFaviconResponse(response, signal)
      if (!bytes || signal.aborted) continue
      const mimeType = normalizedFaviconMimeType(response)
      if (response.headers.has("content-type") && !mimeType) continue
      const dataUrl = input.rasterize(bytes)
      if (
        dataUrl &&
        dataUrl.length <= IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH &&
        /^data:image\/png;base64,[a-z0-9+/]+={0,2}$/iu.test(dataUrl)
      ) {
        return dataUrl
      }
    } catch {
      if (signal.aborted) return null
    }
  }

  return null
}
