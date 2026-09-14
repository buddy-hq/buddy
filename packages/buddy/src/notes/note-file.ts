import fsp from "node:fs/promises"
import path from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
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
const YAML_FRONTMATTER_OPEN = /^---(?:yaml|yml)?[ \t]*\r?\n/u
const YAML_FRONTMATTER_CLOSE = /^---[ \t]*(?:\r?\n|$)/mu
const FRONTMATTER_DELIMITER = "---" as const

export const BuddyNoteIDSchema = z.string().trim().regex(ULID_PATTERN)

export const BuddyNoteMetadataSchema = z
  .object({
    type: z.enum(BUDDY_NOTE_TYPES),
    "buddy-id": BuddyNoteIDSchema,
    "buddy-notebook-id": z.string().trim().min(1),
    notebook: z.string().trim().min(1),
    "buddy-session-id": z.string().trim().min(1).optional(),
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
