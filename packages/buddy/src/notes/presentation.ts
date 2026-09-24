const PREVIEW_LENGTH = 180
const QUOTE_LENGTH = 280
const QUOTE_TITLE_LENGTH = 120
const QUOTE_CALLOUT_TITLE_LINE = /^[ \t]*>[ \t]*\[!quote\][+-]?.*$/gimu
const CALLOUT_MARKER = /^([ \t]*>[ \t]*)\[![a-z0-9_-]+\][+-]?[ \t]*/gimu
const MARKDOWN_HEADING = /^#{1,6}[ \t]+(.+?)[ \t#]*$/u
const MARKDOWN_FENCE = /^[ \t]*(`{3,}|~{3,})/u
const CAPTURE_DATE_LINE = /^\*\*[A-Z][a-z]+ \d{1,2}, \d{4}\*\*[ \t]*$/gmu
const CAPTURE_TIME_LINE = /^\*\d{2}:\d{2}\*[ \t]*$/gmu
const LEGACY_CAPTURE_HEADING = /^#{1,6}[ \t]+(?:Note|Annotation)[ \t]+—[ \t].*$/gmu
const BUDDY_LINK = /\[[^\]]*\]\(buddy:\/\/[^)]*\)/gu
const IMAGE_EMBED = /!\[[^\]]*\]\([^)]*\)/gu

/** Plain prose for note previews and compact message quotes. */
export function notePlainText(markdown: string): string {
  return markdown
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
    .replace(/[*_`~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
}

/** A short excerpt around a content match, or the start of an unsearched note. */
export function plainTextPreview(input: { text: string; match: number }): string {
  const start = Math.max(0, input.match - 45)
  const excerpt = input.text.slice(start, start + PREVIEW_LENGTH).trim()
  return `${start > 0 ? "…" : ""}${excerpt}${start + PREVIEW_LENGTH < input.text.length ? "…" : ""}`
}

/** A message quote stays subordinate to what the learner wrote. */
export function noteMessageExcerpt(content: string, length = QUOTE_LENGTH): string {
  const text = notePlainText(content)
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text
}

function quotedMessageBody(markdown: string) {
  let fence: string | undefined
  const lines = markdown
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const marker = MARKDOWN_FENCE.exec(line)?.[1]
      if (fence) {
        if (
          marker?.[0] === fence[0] &&
          marker.length >= fence.length &&
          !line.trim().slice(marker.length)
        ) {
          fence = undefined
        }
        return line
      }
      if (marker) {
        fence = marker
        return line
      }
      return line.replace(MARKDOWN_HEADING, "**$1**")
    })
  if (fence) lines.push(fence)
  return lines.map((line) => (line.trim() ? `> ${line}` : ">")).join("\n")
}

function renderMessageQuote(input: {
  source: { sessionID: string; messageID: string; text: string }
  expanded: boolean
}) {
  const title = noteMessageExcerpt(input.source.text, QUOTE_TITLE_LENGTH).replace(/[\\<>]/gu, "")
  const link = `buddy://chat/${encodeURIComponent(input.source.sessionID)}?message=${encodeURIComponent(input.source.messageID)}`
  return [
    `> [!quote]${input.expanded ? "+" : "-"}${title ? ` ${title}` : ""}`,
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
