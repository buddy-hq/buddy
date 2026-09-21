import type { UpdateReleaseNote } from "./update-state"

export const MAX_RELEASE_NOTE_ITEMS = 8

export const MAX_RELEASE_NOTE_ITEM_LENGTH = 220

export const MAX_RELEASE_NOTES = 5

const HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
])

const MAX_CODE_POINT = 0x10ffff
const ENTITY_PATTERN = /&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/gu
const BLOCK_TAG_PATTERN = /<\/(?:p|div|li|h[1-6]|ul|ol|blockquote)>/giu
const LIST_TAG_PATTERN = /<li\b[^>]*>/giu
const BREAK_TAG_PATTERN = /<br\s*\/?>/giu
const TAG_PATTERN = /<[^>]*>/gu
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/gu
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`\n]+)`/gu
const MARKDOWN_STRONG_ASTERISK_PATTERN = /\*\*([^*\n]+)\*\*/gu
const MARKDOWN_STRONG_UNDERSCORE_PATTERN = /(?<!\w)__([^_\n]+)__(?!\w)/gu
const MARKDOWN_EMPHASIS_ASTERISK_PATTERN = /\*([^*\n]+)\*/gu
const MARKDOWN_EMPHASIS_UNDERSCORE_PATTERN = /(?<!\w)_([^_\n]+)_(?!\w)/gu
const BULLET_PREFIX_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+/u
const HEADING_PREFIX_PATTERN = /^\s*#{1,6}\s+/u
const TRAILING_ATTRIBUTION_PATTERN = /\s+by\s+@[\w-]+(?:\s+in\s+\S+)?\s*$/iu
const WHITESPACE_PATTERN = /\s+/gu

/**
 * Release bodies are untrusted display text, so normalize them rather than
 * rendering their markup.
 */
export function parseReleaseNote(input: {
  readonly version: string
  readonly body: string
  readonly url: string
}): UpdateReleaseNote {
  const lines = stripMarkup(input.body)
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0)

  const unique: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(truncate(line))
  }

  return {
    version: input.version,
    url: input.url,
    items: unique.slice(0, MAX_RELEASE_NOTE_ITEMS),
    totalItems: unique.length,
  }
}

function decodeEntity(entity: string): string {
  const named = HTML_ENTITIES.get(entity)
  if (named !== undefined) return named

  const codePoint = entity.startsWith("#x")
    ? Number.parseInt(entity.slice(2), 16)
    : entity.startsWith("#")
      ? Number.parseInt(entity.slice(1), 10)
      : Number.NaN
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    return `&${entity};`
  }
  return String.fromCodePoint(codePoint)
}

function stripMarkup(body: string): string {
  return body
    .replace(BREAK_TAG_PATTERN, "\n")
    .replace(LIST_TAG_PATTERN, "\n")
    .replace(BLOCK_TAG_PATTERN, "\n")
    .replace(TAG_PATTERN, "")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(ENTITY_PATTERN, (_match, entity: string) => decodeEntity(entity))
}

function normalizeLine(line: string): string {
  if (HEADING_PREFIX_PATTERN.test(line)) return ""
  return line
    .replace(BULLET_PREFIX_PATTERN, "")
    .replace(MARKDOWN_INLINE_CODE_PATTERN, "$1")
    .replace(MARKDOWN_STRONG_ASTERISK_PATTERN, "$1")
    .replace(MARKDOWN_STRONG_UNDERSCORE_PATTERN, "$1")
    .replace(MARKDOWN_EMPHASIS_ASTERISK_PATTERN, "$1")
    .replace(MARKDOWN_EMPHASIS_UNDERSCORE_PATTERN, "$1")
    .replace(TRAILING_ATTRIBUTION_PATTERN, "")
    .replace(WHITESPACE_PATTERN, " ")
    .trim()
}

function truncate(item: string): string {
  if (item.length <= MAX_RELEASE_NOTE_ITEM_LENGTH) return item
  return `${item.slice(0, MAX_RELEASE_NOTE_ITEM_LENGTH - 1).trimEnd()}…`
}
