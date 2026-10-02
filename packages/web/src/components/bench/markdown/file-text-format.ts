const BYTE_ORDER_MARK = "﻿"
const LINE_FEED = "\n"
const CARRIAGE_RETURN_LINE_FEED = "\r\n"
const LINE_FEED_CODE = 10

export type MarkdownFileTextFormat = {
  readonly byteOrderMark: boolean
  readonly lineEnding: typeof LINE_FEED | typeof CARRIAGE_RETURN_LINE_FEED
  readonly finalNewline: boolean
}

function readDominantLineEnding(markdown: string): MarkdownFileTextFormat["lineEnding"] {
  const carriageReturnLineFeedCount = markdown.match(/\r\n/gu)?.length ?? 0
  if (carriageReturnLineFeedCount === 0) return LINE_FEED
  const bareLineFeedCount = (markdown.match(/\n/gu)?.length ?? 0) - carriageReturnLineFeedCount
  return carriageReturnLineFeedCount > bareLineFeedCount ? CARRIAGE_RETURN_LINE_FEED : LINE_FEED
}

function trimTrailingLineFeeds(text: string): string {
  let end = text.length
  while (end > 0 && text.charCodeAt(end - 1) === LINE_FEED_CODE) end -= 1
  return text.slice(0, end)
}

export function readMarkdownFileTextFormat(markdown: string): MarkdownFileTextFormat {
  return {
    byteOrderMark: markdown.startsWith(BYTE_ORDER_MARK),
    lineEnding: readDominantLineEnding(markdown),
    finalNewline: markdown.endsWith(LINE_FEED),
  }
}

export function applyMarkdownFileTextFormat(
  markdown: string,
  format: MarkdownFileTextFormat,
): string {
  const withoutByteOrderMark = markdown.startsWith(BYTE_ORDER_MARK) ? markdown.slice(1) : markdown
  const lineFeedMarkdown = withoutByteOrderMark.replaceAll(CARRIAGE_RETURN_LINE_FEED, LINE_FEED)
  const body = trimTrailingLineFeeds(lineFeedMarkdown)
  if (body === "") return ""
  const withFinalNewline = format.finalNewline ? `${body}${LINE_FEED}` : body
  const withLineEndings =
    format.lineEnding === CARRIAGE_RETURN_LINE_FEED
      ? withFinalNewline.replaceAll(LINE_FEED, CARRIAGE_RETURN_LINE_FEED)
      : withFinalNewline
  return format.byteOrderMark ? `${BYTE_ORDER_MARK}${withLineEndings}` : withLineEndings
}
