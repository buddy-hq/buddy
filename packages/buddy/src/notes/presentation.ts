const PREVIEW_LENGTH = 180
const QUOTE_LENGTH = 280
const QUOTE_TITLE_LENGTH = 120
const QUOTE_CALLOUT_TITLE_LINE = /^[ \t]*>[ \t]*\[!quote\][+-]?.*$/gimu
const CALLOUT_MARKER = /^([ \t]*>[ \t]*)\[![a-z0-9_-]+\][+-]?[ \t]*/gimu
const MARKDOWN_HEADING = /^#{1,6}[ \t]+(.+?)[ \t#]*$/u
const MARKDOWN_FENCE = /^[ \t]*(`{3,}(?=[^`]*$)|~{3,})/u
const INLINE_MARKUP = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)|`+|[^\s`]+/gu
const TOKEN_MARKERS = /[*~]+|(?<![\p{L}\p{M}\p{N}_])_+|_+(?![\p{L}\p{M}\p{N}_])/gu
const EDGE_ASTERISKS = /^\*+|\*+$/gu
const CAPTURE_DATE_LINE = /^\*\*[A-Z][a-z]+ \d{1,2}, \d{4}\*\*[ \t]*$/gmu
const CAPTURE_TIME_LINE = /^\*\d{2}:\d{2}\*[ \t]*$/gmu
const LEGACY_CAPTURE_HEADING = /^#{1,6}[ \t]+(?:Note|Annotation)[ \t]+—[ \t].*$/gmu
const BUDDY_LINK = /\[[^\]]*\]\(buddy:\/\/[^)]*\)/gu
const IMAGE_EMBED = /!\[[^\]]*\]\([^)]*\)/gu
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function graphemeBoundaryAtOrBefore(text: string, index: number): number {
  if (index <= 0) return 0
  if (index >= text.length) return text.length
  return graphemeSegmenter.segment(text).containing(index)?.index ?? index
}

function graphemeBoundaryAtOrAfter(text: string, index: number): number {
  if (index <= 0) return 0
  if (index >= text.length) return text.length
  const containing = graphemeSegmenter.segment(text).containing(index)
  if (!containing || containing.index === index) return index
  return containing.index + containing.segment.length
}

type TFenceLine = { fence: string | undefined; code: boolean; boundary: boolean }

/** Track fence boundaries so quoted code stays literal and fence labels stay out of excerpts. */
export function fenceLine(line: string, fence: string | undefined): TFenceLine {
  const marker = MARKDOWN_FENCE.exec(line)?.[1]
  if (!fence) {
    return marker
      ? { fence: marker, code: true, boundary: true }
      : { fence, code: false, boundary: false }
  }
  const closes =
    marker?.[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length)
  return closes
    ? { fence: undefined, code: true, boundary: true }
    : { fence, code: true, boundary: false }
}

function unmarkToken(token: string): string {
  if (token.includes("/")) return token.replace(EDGE_ASTERISKS, "")
  return token.replace(TOKEN_MARKERS, "")
}

function unmarkInline(prose: string): string {
  return prose.replace(
    INLINE_MARKUP,
    (match, _ticks: string | undefined, code: string | undefined) => {
      if (code !== undefined) return code
      return match.startsWith("`") ? "" : unmarkToken(match)
    },
  )
}

function unmarkMarkdown(markdown: string): string {
  const parts: string[] = []
  let prose: string[] = []
  let fence: string | undefined
  const flushProse = () => {
    if (prose.length > 0) parts.push(unmarkInline(prose.join("\n")))
    prose = []
  }
  for (const line of markdown.split(/\r?\n/u)) {
    const step = fenceLine(line, fence)
    fence = step.fence
    if (!step.code) {
      prose.push(line)
      continue
    }
    flushProse()
    if (!step.boundary) parts.push(line)
  }
  flushProse()
  return parts.join("\n")
}

/** Plain prose for note previews and compact message quotes. */
export function notePlainText(markdown: string): string {
  const blocks = markdown
    .replace(/^---(?:yaml|yml)?[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, "")
    .replace(QUOTE_CALLOUT_TITLE_LINE, "")
    .replace(CALLOUT_MARKER, "$1")
    .replace(CAPTURE_DATE_LINE, "")
    .replace(CAPTURE_TIME_LINE, "")
    .replace(LEGACY_CAPTURE_HEADING, "")
    .replace(BUDDY_LINK, "")
    .replace(IMAGE_EMBED, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]*>/gu, "")
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+] |\d+\. )/gmu, "")
  return unmarkMarkdown(blocks).replace(/\s+/gu, " ").trim()
}

/** A short excerpt around a content match, or the start of an unsearched note. */
export function plainTextPreview(input: { text: string; match: number }): string {
  const start = graphemeBoundaryAtOrAfter(input.text, Math.max(0, input.match - 45))
  const end = graphemeBoundaryAtOrBefore(input.text, start + PREVIEW_LENGTH)
  const excerpt = input.text.slice(start, end).trim()
  return `${start > 0 ? "…" : ""}${excerpt}${end < input.text.length ? "…" : ""}`
}

/** A message quote stays subordinate to what the learner wrote. */
export function noteMessageExcerpt(content: string, length = QUOTE_LENGTH): string {
  const text = notePlainText(content)
  if (text.length <= length) return text
  return `${text.slice(0, graphemeBoundaryAtOrBefore(text, length)).trimEnd()}…`
}

/** Quote message Markdown, preserving fenced code and closing unfinished fences. */
export function quotedMessageBody(markdown: string) {
  let fence: string | undefined
  const lines = markdown
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const step = fenceLine(line, fence)
      fence = step.fence
      return step.code ? line : line.replace(MARKDOWN_HEADING, "**$1**")
    })
  if (fence) lines.push(fence)
  return lines.map((line) => (line.trim() ? `> ${line}` : ">")).join("\n")
}

/** Build the generated quote heading from a readable, bounded message excerpt. */
export function messageQuoteTitleLine(input: { text: string; expanded: boolean }) {
  const title = noteMessageExcerpt(input.text, QUOTE_TITLE_LENGTH).replace(/[\\<>]/gu, "")
  return `> [!quote]${input.expanded ? "+" : "-"}${title ? ` ${title}` : ""}`
}

function renderMessageQuote(input: {
  source: { sessionID: string; messageID: string; text: string }
  expanded: boolean
}) {
  const link = `buddy://chat/${encodeURIComponent(input.source.sessionID)}?message=${encodeURIComponent(input.source.messageID)}`
  return [
    messageQuoteTitleLine({ text: input.source.text, expanded: input.expanded }),
    quotedMessageBody(input.source.text),
    ">",
    `> [Open message](${link})`,
  ].join("\n")
}

/** Replace runtime placeholder titles with a readable, dated note name. */
export function sessionNoteTitle(title: string, createdAt: number): string {
  if (
    title.trim() &&
    !/^(?:New (?:session|chat)|Child session)(?: - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/iu.test(
      title,
    )
  ) {
    return title
  }
  return `Chat notes - ${new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(createdAt)}`
}

/** Append dated captures without filling the document outline with duplicate headings. */
type SessionNoteEntry = {
  day: string
  content: string
}

export function renderSessionNoteEntry(input: {
  text: string
  imageLinks: readonly string[]
  capturedAt: Date
  previousDay?: string
  source?: { sessionID: string; messageID: string; text: string }
}): SessionNoteEntry {
  const day = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input.capturedAt)
  const date = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(input.capturedAt)
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(input.capturedAt)
  const quote = input.source
    ? renderMessageQuote({
        source: input.source,
        expanded: !input.text && input.imageLinks.length === 0,
      })
    : undefined
  return {
    day,
    content: [
      input.previousDay === day ? undefined : `**${date}**`,
      `*${time}*`,
      quote,
      input.text,
      ...input.imageLinks,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }
}
