export const RAW_HTML_BLOCK_LANGUAGE = "\u2060buddy-raw-html"
export const RAW_HTML_TIGHT_META = "tight"

const RAW_HTML_INLINE_PREFIX = "\u2060buddy-raw-html:"

export function rawHtmlBlockInfo(tight: boolean): string {
  return tight ? `${RAW_HTML_BLOCK_LANGUAGE} ${RAW_HTML_TIGHT_META}` : RAW_HTML_BLOCK_LANGUAGE
}

export function rawHtmlInlineCarrier(html: string): string {
  return `\`${RAW_HTML_INLINE_PREFIX}${encodeURIComponent(html)}\``
}

export function readRawHtmlInlineCarrier(value: string): string | undefined {
  if (!value.startsWith(RAW_HTML_INLINE_PREFIX)) return undefined
  try {
    return decodeURIComponent(value.slice(RAW_HTML_INLINE_PREFIX.length))
  } catch {
    return undefined
  }
}
