import fsp from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import {
  isMap,
  isScalar,
  parse as parseYaml,
  parseDocument,
  stringify as stringifyYaml,
} from "yaml"
import z from "zod"
import { BUDDY_NOTE_TYPES } from "./types"
import type { NoteSummary } from "./types"

const NOTE_FILENAME_SEPARATOR = " — " as const
const MARKDOWN_EXTENSION = ".md" as const
const MAX_NOTE_TITLE_LENGTH = 120
const INVALID_FILENAME_CHARACTER = /[<>:"/\\|?*#^\u005b\u005d]/gu
const CONTROL_CHARACTER_MAX_CODE_POINT = 31
const TRAILING_FILENAME_CHARACTER = /[. ]+$/u
const WINDOWS_RESERVED_NOTE_TITLE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu
const WHITESPACE = /\s+/gu
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u
const YAML_FRONTMATTER_OPEN = /^\uFEFF?---(?:yaml|yml)?[ \t]*\r?\n/u
const YAML_FRONTMATTER_CLOSE = /^---[ \t]*(?:\r?\n|$)/mu
const FRONTMATTER_DELIMITER = "---" as const
const LINE_ENDING_AT_END = /\r?\n$/u
const CRLF_LINE_ENDINGS = /\r\n/gu
const LINE_FEEDS = /\n/gu
const LINE_BREAKS = /\r?\n/gu

export const BuddyNoteIDSchema = z.string().trim().regex(ULID_PATTERN)

export const BuddyNoteMetadataSchema = z
  .object({
    type: z.enum(BUDDY_NOTE_TYPES),
    "buddy-id": BuddyNoteIDSchema,
    "buddy-notebook-id": z.string().trim().min(1),
    notebook: z.string().trim().min(1),
    "buddy-session-id": z.string().trim().min(1).optional(),
    "buddy-generated-title": z.string().optional(),
    "buddy-last-capture-day": z.string().optional(),
  })
  .passthrough()

export type BuddyNoteMetadata = z.infer<typeof BuddyNoteMetadataSchema>

export type ParsedNoteFile = {
  filepath: string
  source: string
  content: string
  metadata?: BuddyNoteMetadata
  summary: NoteSummary
}

export function normalizeNoteTitle(rawTitle: string, fallback: string) {
  const normalized = rawTitle
    .replace(INVALID_FILENAME_CHARACTER, " ")
    .split("")
    .map((character) =>
      (character.codePointAt(0) ?? 0) <= CONTROL_CHARACTER_MAX_CODE_POINT ? " " : character,
    )
    .join("")
    .replace(WHITESPACE, " ")
    .trim()
    .replace(TRAILING_FILENAME_CHARACTER, "")
    .slice(0, MAX_NOTE_TITLE_LENGTH)
    .trim()
  return normalized || fallback
}

export function isWindowsReservedNoteTitle(title: string): boolean {
  return WINDOWS_RESERVED_NOTE_TITLE.test(title)
}

// Older Buddy notes end their filename in ` — <ID>`; strip it so they keep a clean title.
export function noteTitleFromFilename(filename: string, id: string) {
  const extensionless = filename.endsWith(MARKDOWN_EXTENSION)
    ? filename.slice(0, -MARKDOWN_EXTENSION.length)
    : filename
  const identitySuffix = `${NOTE_FILENAME_SEPARATOR}${id}`
  return extensionless.endsWith(identitySuffix)
    ? extensionless.slice(0, -identitySuffix.length)
    : extensionless
}

export function parseNoteSource(source: string) {
  const opening = YAML_FRONTMATTER_OPEN.exec(source)
  if (!opening) return undefined
  const remainder = source.slice(opening[0].length)
  const closing = YAML_FRONTMATTER_CLOSE.exec(remainder)
  if (!closing) return undefined
  let data: unknown
  try {
    data = parseYaml(remainder.slice(0, closing.index))
  } catch {
    return undefined
  }
  const metadata = BuddyNoteMetadataSchema.safeParse(data)
  if (!metadata.success) return undefined
  return {
    content: remainder.slice(closing.index + closing[0].length),
    metadata: metadata.data,
  }
}

export function renderNoteSource(content: string, metadata: BuddyNoteMetadata) {
  // Serialize only the stamp: the body is opaque Markdown and must round-trip exactly.
  return `${FRONTMATTER_DELIMITER}\n${stringifyYaml(metadata)}${FRONTMATTER_DELIMITER}\n${content}`
}

function withNoteBody(frontmatter: string, content: string) {
  if (frontmatter === "" || LINE_ENDING_AT_END.test(frontmatter)) return `${frontmatter}${content}`
  const lineEnding = frontmatter.includes("\r\n") ? "\r\n" : "\n"
  return `${frontmatter}${lineEnding}${content}`
}

export function replaceNoteBody(note: { source: string; content: string }, content: string) {
  return withNoteBody(note.source.slice(0, note.source.length - note.content.length), content)
}

function dominantLineEnding(source: string) {
  const crlfCount = source.match(CRLF_LINE_ENDINGS)?.length ?? 0
  const lineFeedCount = source.match(LINE_FEEDS)?.length ?? 0
  return crlfCount > lineFeedCount - crlfCount ? "\r\n" : "\n"
}

export function appendNoteBodyEntry(note: { source: string; content: string }, entry: string) {
  const lineEnding = dominantLineEnding(note.source)
  const lines = lineEnding === "\n" ? entry : entry.replace(LINE_BREAKS, lineEnding)
  return `${note.content.trimEnd()}${lineEnding}${lineEnding}${lines}${lineEnding}`
}

type YamlTextEdit = {
  start: number
  end: number
  text: string
}

function singleLine(yaml: string): string | undefined {
  const text = yaml.replace(LINE_ENDING_AT_END, "")
  return text.includes("\n") ? undefined : text
}

function lineStartBefore(text: string, index: number) {
  return text.lastIndexOf("\n", index - 1) + 1
}

function lineEndAfter(text: string, index: number) {
  const lineFeed = text.indexOf("\n", index - 1)
  return lineFeed === -1 ? text.length : lineFeed + 1
}

function changedMetadataKeys(previous: BuddyNoteMetadata, next: BuddyNoteMetadata) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(
    (key) => !isDeepStrictEqual(previous[key], next[key]),
  )
}

function yamlMatchesMetadata(yaml: string, expected: BuddyNoteMetadata) {
  try {
    const parsed = BuddyNoteMetadataSchema.safeParse(parseYaml(yaml))
    return parsed.success && isDeepStrictEqual(parsed.data, expected)
  } catch {
    return false
  }
}

function frontmatterYamlEdit(
  yaml: string,
  previous: BuddyNoteMetadata,
  next: BuddyNoteMetadata,
): string | undefined {
  const document = parseDocument(yaml)
  if (document.errors.length > 0 || !isMap(document.contents)) return undefined
  const lineEnding = yaml.includes("\r\n") ? "\r\n" : "\n"
  const edits: YamlTextEdit[] = []
  let appended = ""
  for (const key of changedMetadataKeys(previous, next)) {
    const value = next[key]
    const pair = document.contents.items.find(
      (item) => isScalar(item.key) && item.key.value === key,
    )
    if (!pair) {
      const line =
        value === undefined ? "" : singleLine(stringifyYaml({ [key]: value }, { lineWidth: 0 }))
      if (line === undefined) return undefined
      appended += line === "" ? "" : `${line}${lineEnding}`
      continue
    }
    if (!isScalar(pair.key) || !isScalar(pair.value) || !pair.key.range || !pair.value.range) {
      return undefined
    }
    const [valueStart, valueEnd] = pair.value.range
    if (value === undefined) {
      edits.push({
        start: lineStartBefore(yaml, pair.key.range[0]),
        end: lineEndAfter(yaml, valueEnd),
        text: "",
      })
      continue
    }
    const scalar = singleLine(stringifyYaml(value, { lineWidth: 0 }))
    if (scalar === undefined) return undefined
    edits.push({ start: valueStart, end: valueEnd, text: scalar })
  }
  const edited = `${edits
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`,
      yaml,
    )}${appended}`
  return yamlMatchesMetadata(edited, next) ? edited : undefined
}

function frontmatterYamlRewrite(
  yaml: string,
  previous: BuddyNoteMetadata,
  next: BuddyNoteMetadata,
): string | undefined {
  const document = parseDocument(yaml)
  if (document.errors.length > 0 || !isMap(document.contents)) return undefined
  for (const key of changedMetadataKeys(previous, next)) {
    const value = next[key]
    if (value === undefined) {
      document.delete(key)
      continue
    }
    const node = document.createNode(value)
    const existing = document.contents.get(key, true)
    if (isScalar(existing) && existing.comment) node.comment = existing.comment
    document.set(key, node)
  }
  const rewritten = document.toString({ lineWidth: 0 })
  return yamlMatchesMetadata(rewritten, next) ? rewritten : undefined
}

export function replaceNoteMetadata(
  note: { source: string; content: string; metadata?: BuddyNoteMetadata },
  metadata: BuddyNoteMetadata,
  content = note.content,
) {
  const opening = YAML_FRONTMATTER_OPEN.exec(note.source)
  if (!opening || !note.metadata) return renderNoteSource(content, metadata)
  const remainder = note.source.slice(opening[0].length)
  const closing = YAML_FRONTMATTER_CLOSE.exec(remainder)
  if (!closing) return renderNoteSource(content, metadata)
  const yaml = remainder.slice(0, closing.index)
  const lineEnding = dominantLineEnding(`${opening[0]}${yaml}${closing[0]}`)
  const edited =
    frontmatterYamlEdit(yaml, note.metadata, metadata) ??
    frontmatterYamlRewrite(yaml, note.metadata, metadata)?.replace(LINE_BREAKS, lineEnding) ??
    stringifyYaml(metadata).replace(LINE_BREAKS, lineEnding)
  return withNoteBody(`${opening[0]}${edited}${closing[0]}`, content)
}

export function toPosixRelativePath(root: string, filepath: string) {
  return path.relative(root, filepath).split(path.sep).join(path.posix.sep)
}

export function plainNoteTitleFromFilename(filename: string) {
  return filename.endsWith(MARKDOWN_EXTENSION)
    ? filename.slice(0, -MARKDOWN_EXTENSION.length)
    : filename
}

export function parseNoteFile(input: {
  root: string
  filepath: string
  source: string
  updatedAt: number
}): ParsedNoteFile {
  const parsed = parseNoteSource(input.source)
  const relativePath = toPosixRelativePath(input.root, input.filepath)
  if (!parsed) {
    return {
      filepath: input.filepath,
      source: input.source,
      content: input.source,
      summary: {
        kind: "plain",
        title: plainNoteTitleFromFilename(path.basename(input.filepath)),
        relativePath,
        updatedAt: input.updatedAt,
      },
    }
  }

  const id = parsed.metadata["buddy-id"]
  const summary: NoteSummary = {
    kind: "buddy",
    id,
    type: parsed.metadata.type,
    title: noteTitleFromFilename(path.basename(input.filepath), id),
    relativePath,
    notebookID: parsed.metadata["buddy-notebook-id"],
    notebook: parsed.metadata.notebook,
    notebookAvailable: false,
    updatedAt: input.updatedAt,
  }
  const sessionID = parsed.metadata["buddy-session-id"]
  if (sessionID) summary.sessionID = sessionID
  return {
    filepath: input.filepath,
    source: input.source,
    content: parsed.content,
    metadata: parsed.metadata,
    summary,
  }
}

export async function readNoteFile(root: string, filepath: string) {
  const [source, stat] = await Promise.all([fsp.readFile(filepath, "utf8"), fsp.stat(filepath)])
  return parseNoteFile({ root, filepath, source, updatedAt: stat.mtimeMs })
}
