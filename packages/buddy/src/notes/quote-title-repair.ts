import fsp from "node:fs/promises"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLock } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"
import { activateNotesLibraryRoot, invalidateIndexedPath, scanNotes } from "./library-index"
import { withNotesMutationLock } from "./mutation-lock"
import { parseNoteSource, replaceNoteBody } from "./note-file"
import { fenceLine, messageQuoteTitleLine, quotedMessageBody } from "./presentation"

const SESSION_NOTE_TYPE = "buddy-session-note" as const
const LEGACY_QUOTE_TITLE_LENGTH = 120
const QUOTE_TITLE_MARKER = /^> \[!quote\]([+-])/u
const QUOTE_MESSAGE_LINK_LINE =
  /^> \[Open message\]\(buddy:\/\/chat\/[^\s()?]+\?message=[^\s()]+\)$/u
const QUOTE_BODY_SEPARATOR_LINE = ">" as const
const QUOTE_LINE_PREFIX_LENGTH = 2

function errorMessage<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

function legacyMessageQuoteTitleLine(input: { text: string; expanded: boolean }) {
  const plain = input.text
    .replace(/^---(?:yaml|yml)?[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, "")
    .replace(/^[ \t]*>[ \t]*\[!quote\][+-]?.*$/gimu, "")
    .replace(/^([ \t]*>[ \t]*)\[![a-z0-9_-]+\][+-]?[ \t]*/gimu, "$1")
    .replace(/^\*\*[A-Z][a-z]+ \d{1,2}, \d{4}\*\*[ \t]*$/gmu, "")
    .replace(/^\*\d{2}:\d{2}\*[ \t]*$/gmu, "")
    .replace(/^#{1,6}[ \t]+(?:Note|Annotation)[ \t]+—[ \t].*$/gmu, "")
    .replace(/\[[^\]]*\]\(buddy:\/\/[^)]*\)/gu, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]*>/gu, "")
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+] |\d+\. )/gmu, "")
    .replace(/[*_`~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
  const excerpt =
    plain.length > LEGACY_QUOTE_TITLE_LENGTH
      ? `${plain.slice(0, LEGACY_QUOTE_TITLE_LENGTH).trimEnd()}…`
      : plain
  const title = excerpt.replace(/[\\<>]/gu, "")
  return `> [!quote]${input.expanded ? "+" : "-"}${title ? ` ${title}` : ""}`
}

function asSavedToDisk(text: string) {
  return Buffer.from(text, "utf8").toString("utf8")
}

function withoutCarriageReturn(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line
}

function repairedQuoteTitleLine(callout: readonly string[]): string | undefined {
  const [titleLine = "", ...quoted] = callout
  const marker = QUOTE_TITLE_MARKER.exec(titleLine)
  if (
    !marker ||
    quoted.at(-2) !== QUOTE_BODY_SEPARATOR_LINE ||
    !QUOTE_MESSAGE_LINK_LINE.test(quoted.at(-1) ?? "")
  ) {
    return undefined
  }
  const body = quoted.slice(0, -2)
  const text = body.map((line) => line.slice(QUOTE_LINE_PREFIX_LENGTH)).join("\n")
  if (quotedMessageBody(text) !== body.join("\n")) return undefined
  const expanded = marker[1] === "+"
  if (titleLine !== asSavedToDisk(legacyMessageQuoteTitleLine({ text, expanded }))) {
    return undefined
  }
  return messageQuoteTitleLine({ text, expanded })
}

/** Replace recognized legacy generated quote headings while preserving every other source byte. */
export function repairLegacyQuoteTitles(content: string): string {
  const savedLines = content.split("\n")
  const lines = savedLines.map(withoutCarriageReturn)
  let fence: string | undefined
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (!line.startsWith(">")) {
      fence = fenceLine(line, fence).fence
      index += 1
      continue
    }
    let end = index + 1
    while (lines[end]?.startsWith(">")) end += 1
    const repaired = fence ? undefined : repairedQuoteTitleLine(lines.slice(index, end))
    if (repaired !== undefined) {
      savedLines[index] = `${repaired}${(savedLines[index] ?? "").slice(line.length)}`
    }
    index = end
  }
  return savedLines.join("\n")
}

async function repairSessionNoteFile(root: string, filepath: string): Promise<boolean> {
  return withNotesMutationLock(root, () =>
    withFileLock(textFileWriteLockPath(filepath), async () => {
      const bytes = await fsp.readFile(filepath)
      const source = bytes.toString("utf8")
      if (!Buffer.from(source, "utf8").equals(bytes)) return false
      const note = parseNoteSource(source)
      if (note?.metadata.type !== SESSION_NOTE_TYPE) return false
      const content = repairLegacyQuoteTitles(note.content)
      if (content === note.content) return false
      await writeTextFileAtomic(
        filepath,
        replaceNoteBody({ source, content: note.content }, content),
      )
      invalidateIndexedPath(root, filepath)
      return true
    }),
  )
}

/** Repair chat-note headings under the library and file locks, returning the changed file count. */
export async function repairLegacyQuoteTitlesInNotesLibrary(): Promise<number> {
  const root = await activateNotesLibraryRoot()
  let repairedNotes = 0
  for (const note of await scanNotes(root)) {
    if (
      note.summary.type !== SESSION_NOTE_TYPE ||
      repairLegacyQuoteTitles(note.content) === note.content
    ) {
      continue
    }
    try {
      if (await repairSessionNoteFile(root, note.filepath)) repairedNotes += 1
    } catch (error) {
      console.error("Could not repair quote titles in a chat note", {
        path: note.summary.relativePath,
        error: errorMessage(error),
      })
    }
  }
  return repairedNotes
}

/** Start the background startup repair and report failures without preventing server startup. */
export function startLegacyQuoteTitleRepair(): void {
  void repairLegacyQuoteTitlesInNotesLibrary().catch((error) => {
    console.error("Could not repair quote titles in the Notes library", {
      error: errorMessage(error),
    })
  })
}
