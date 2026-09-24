import fsp from "node:fs/promises"
import path from "node:path"
import { monotonicFactory } from "ulid"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLock, withFileLocks } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"
import { parseNodeErrorCode } from "../storage/parse-node-error"
import { isPathInsideDirectory } from "../storage/path-containment"
import {
  FileRenameConflictError,
  renameFileWithoutOverwrite,
} from "../storage/rename-file-without-overwrite"
import { textContentVersion } from "../storage/text-content-version"
import { NotesError } from "./errors"
import {
  activateNotesLibraryRoot,
  ensureNotesDirectories,
  invalidateIndexedPath,
  scanNotes,
} from "./library-index"
import {
  isWindowsReservedNoteTitle,
  normalizeNoteTitle,
  readNoteFile,
  renderNoteSource,
  type BuddyNoteMetadata,
  type ParsedNoteFile,
} from "./note-file"
import {
  ensureNotebookIdentity,
  findNotebookIdentity,
  findNotebookDirectory,
  loadNotebookLabelsByID,
  type NotesNotebookIdentity,
} from "./notebook-identity"
import { isLexicallyReservedNotesAttachmentsPath, isReservedNotesAttachmentsPath } from "./paths"
import { withNotesMutationLock } from "./mutation-lock"
import { notePlainText, plainTextPreview } from "./presentation"
import type { BuddyNoteType, NoteDocument, NoteSummary, NotesLibraryView } from "./types"

const DEFAULT_NOTE_TITLE = "Untitled note" as const
const NOTE_FILE_EXTENSION = ".md" as const
/** Obsidian-style numbering bound: `Title.md`, then `Title 1.md`, up to this many copies. */
const MAX_NOTE_FILENAME_COPIES = 1_000
const NODE_ERROR_NOT_FOUND = "ENOENT" as const
const NODE_ERROR_EXISTS = "EEXIST" as const
const NOTES_RESERVED_ATTACHMENTS_PATH_ERROR =
  "Note path is reserved by the Attachments directory" as const
export const createNoteID = monotonicFactory()

async function legacyNoteTitlesAtLibraryRoot(root: string): Promise<ReadonlySet<string>> {
  const titles = new Set<string>()
  for (const note of await scanNotes(root)) {
    if (note.summary.kind !== "buddy" || path.dirname(note.filepath) !== root) continue
    const filenameTitle = path.basename(note.filepath, NOTE_FILE_EXTENSION)
    if (filenameTitle !== note.summary.title) titles.add(note.summary.title)
  }
  return titles
}

function normalizeNotePath(input: string) {
  const normalized = input.trim().replaceAll("\\", "/")
  const segments = normalized.split("/")
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    !normalized.toLowerCase().endsWith(NOTE_FILE_EXTENSION)
  ) {
    throw new NotesError(400, "Invalid Notes library path")
  }
  return normalized
}

function assertNotesLibraryContainment(root: string, filepath: string) {
  if (!isPathInsideDirectory(root, filepath)) {
    throw new NotesError(400, "Note path escapes the Notes library")
  }
}

function assertLexicallyAllowedNotesLibraryPath(root: string, filepath: string) {
  assertNotesLibraryContainment(root, filepath)
  if (isLexicallyReservedNotesAttachmentsPath(root, filepath)) {
    throw new NotesError(400, NOTES_RESERVED_ATTACHMENTS_PATH_ERROR)
  }
}

async function assertAllowedExistingNotesLibraryPath(root: string, filepath: string) {
  assertNotesLibraryContainment(root, filepath)
  if (await isReservedNotesAttachmentsPath(root, filepath)) {
    throw new NotesError(400, NOTES_RESERVED_ATTACHMENTS_PATH_ERROR)
  }
}

function resolveLexicalNotePath(root: string, relativePath: string) {
  const filepath = path.resolve(root, relativePath)
  assertLexicallyAllowedNotesLibraryPath(root, filepath)
  return filepath
}

async function resolveExistingNotePath(root: string, relativePath: string) {
  const filepath = resolveLexicalNotePath(root, relativePath)
  const [stats, realPath, realRoot] = await Promise.all([
    fsp.lstat(filepath).catch((error) => {
      if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return undefined
      throw error
    }),
    fsp.realpath(filepath).catch((error) => {
      if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return undefined
      throw error
    }),
    fsp.realpath(root),
  ])
  if (!stats || !realPath || !stats.isFile() || stats.isSymbolicLink()) {
    throw new NotesError(404, "Note not found")
  }
  await assertAllowedExistingNotesLibraryPath(realRoot, realPath)
  return filepath
}

function noteMetadata(input: {
  type: BuddyNoteType
  id: string
  notebook: NotesNotebookIdentity
  sessionID?: string
}): BuddyNoteMetadata {
  const metadata: BuddyNoteMetadata = {
    type: input.type,
    "buddy-id": input.id,
    "buddy-notebook-id": input.notebook.id,
    notebook: input.notebook.name,
  }
  if (input.sessionID) metadata["buddy-session-id"] = input.sessionID
  return metadata
}

/** Creates a uniquely named stamped note and reads its parsed representation. */
export async function createNoteFile(input: {
  root: string
  directory?: string
  title: string
  metadata: BuddyNoteMetadata
  content: string
  /** Runs after the new note is written, before its fallible readback. */
  onCommitted?: (filepath: string) => void
}) {
  await ensureNotesDirectories(input.root)
  const directory = input.directory ?? input.root
  assertLexicallyAllowedNotesLibraryPath(input.root, directory)
  if (directory !== input.root) await fsp.mkdir(directory, { recursive: true })
  const legacyTitles =
    directory === input.root ? await legacyNoteTitlesAtLibraryRoot(input.root) : new Set<string>()
  for (let copy = 0; copy < MAX_NOTE_FILENAME_COPIES; copy += 1) {
    const stem = copy === 0 ? input.title : `${input.title} ${copy}`
    if (legacyTitles.has(stem) || isWindowsReservedNoteTitle(stem)) continue
    const filepath = path.join(directory, `${stem}${NOTE_FILE_EXTENSION}`)
    const metadata =
      input.metadata["buddy-generated-title"] === undefined
        ? input.metadata
        : { ...input.metadata, "buddy-generated-title": stem }
    const source = renderNoteSource(input.content, metadata)
    try {
      await fsp.writeFile(filepath, source, { encoding: "utf8", flag: "wx" })
    } catch (error) {
      if (parseNodeErrorCode(error) === NODE_ERROR_EXISTS) continue
      throw error
    }
    input.onCommitted?.(filepath)
    invalidateIndexedPath(input.root, filepath)
    return readNoteFile(input.root, filepath)
  }
  throw new NotesError(409, "Too many notes already use this title")
}

function applyNotebookContext(
  summary: NoteSummary,
  availableNotebooks: ReadonlyMap<string, string>,
) {
  if (summary.kind === "plain" || !summary.notebookID) return summary
  const currentName = availableNotebooks.get(summary.notebookID)
  return {
    ...summary,
    notebook: currentName ?? summary.notebook,
    notebookAvailable: currentName !== undefined,
  }
}

const plainTextByNote = new WeakMap<ParsedNoteFile, string>()

function notePlainTextCached(note: ParsedNoteFile) {
  const cached = plainTextByNote.get(note)
  if (cached !== undefined) return cached
  const text = notePlainText(note.content)
  plainTextByNote.set(note, text)
  return text
}

function literalSearchPattern(query: string) {
  return query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu") : undefined
}

export async function listNotes(directory: string, query = ""): Promise<NotesLibraryView> {
  const root = await activateNotesLibraryRoot()
  const [activeNotebook, availableNotebooks, notes] = await Promise.all([
    findNotebookIdentity(directory),
    loadNotebookLabelsByID(directory),
    scanNotes(root),
  ])
  if (activeNotebook) availableNotebooks.set(activeNotebook.id, activeNotebook.name)
  const bodyQuery = query.trim()
  const metadataQuery = bodyQuery.replaceAll("\\", "/").toLowerCase()
  const bodyPattern = literalSearchPattern(bodyQuery)
  const previewPattern = literalSearchPattern(notePlainText(bodyQuery))
  const matchingNotes: NoteSummary[] = []
  for (const note of notes) {
    const summary = applyNotebookContext(note.summary, availableNotebooks)
    const text = notePlainTextCached(note)
    if (
      bodyPattern &&
      !bodyPattern.test(note.content) &&
      !bodyPattern.test(text) &&
      ![summary.title, summary.relativePath, summary.notebook ?? ""]
        .join("\n")
        .toLowerCase()
        .includes(metadataQuery)
    ) {
      continue
    }
    const match = previewPattern ? text.search(previewPattern) : 0
    matchingNotes.push(
      Object.assign({}, summary, {
        preview: plainTextPreview({ text, match: Math.max(0, match) }),
      }),
    )
  }
  const library: NotesLibraryView = {
    directory: root,
    notes: matchingNotes.toSorted((left, right) => right.updatedAt - left.updatedAt),
  }
  if (activeNotebook) library.activeNotebookID = activeNotebook.id
  return library
}

export async function createStandaloneNote(input: { directory: string; title?: string }) {
  const [root, notebook] = await Promise.all([
    activateNotesLibraryRoot(),
    ensureNotebookIdentity(input.directory),
  ])
  const id = createNoteID()
  const title = normalizeNoteTitle(input.title ?? DEFAULT_NOTE_TITLE, DEFAULT_NOTE_TITLE)
  const created = await createNoteFile({
    root,
    title,
    metadata: noteMetadata({ type: "buddy-note", id, notebook }),
    content: "",
  })
  return created.summary
}

async function readExistingNote(root: string, relativePath: string) {
  const filepath = await resolveExistingNotePath(root, normalizeNotePath(relativePath))
  return readNoteFile(root, filepath)
}

async function readNoteAtPath(root: string, relativePath: string, id?: string) {
  if (!id) return readExistingNote(root, relativePath)
  const atPath = await readExistingNote(root, relativePath).catch((error) => {
    if (error instanceof NotesError && error.status === 404) return undefined
    throw error
  })
  if (atPath?.summary.id === id) return atPath
  const match = (await scanNotes(root)).find((note) => note.summary.id === id)
  if (!match) throw new NotesError(404, "Note not found")
  return readExistingNote(root, match.summary.relativePath)
}

async function noteDocument(note: ParsedNoteFile): Promise<NoteDocument> {
  const document: NoteDocument = {
    note: note.summary,
    content: note.content,
    // Frontmatter can change when Buddy follows a chat title. Editor concurrency is about the
    // learner-authored body, so metadata-only rewrites must not manufacture a body conflict.
    version: textContentVersion(note.content) ?? "",
  }
  if (note.metadata) document.properties = note.metadata
  if (note.summary.sessionID && note.summary.notebookID) {
    document.sourceDirectory = await findNotebookDirectory(note.summary.notebookID)
  }
  return document
}

export async function readNote(relativePath: string, id?: string): Promise<NoteDocument> {
  const root = await activateNotesLibraryRoot()
  return noteDocument(await readNoteAtPath(root, relativePath, id))
}

export async function readNoteLocation(relativePath: string, id?: string) {
  const root = await activateNotesLibraryRoot()
  const note = await readNoteAtPath(root, relativePath, id)
  return { filepath: note.filepath }
}

export async function findSessionNote(sessionID: string): Promise<{ note?: NoteSummary }> {
  const root = await activateNotesLibraryRoot()
  const note = (await scanNotes(root)).find(
    (candidate) =>
      candidate.summary.type === "buddy-session-note" && candidate.summary.sessionID === sessionID,
  )
  return note ? { note: note.summary } : {}
}

export async function findCurrentNotePath(input: { path: string; id: string }) {
  const root = await activateNotesLibraryRoot()
  const note = await readNoteAtPath(root, input.path, input.id).catch(() => undefined)
  return note?.summary.relativePath
}

export async function updateNote(input: {
  path: string
  id?: string
  content: string
  expectedVersion?: string | null
}): Promise<NoteDocument> {
  const root = await activateNotesLibraryRoot()
  return withNotesMutationLock(root, async () => {
    const resolved = await readNoteAtPath(root, input.path, input.id)
    const normalizedPath = resolved.summary.relativePath
    const filepath = await resolveExistingNotePath(root, normalizedPath)
    return withFileLock(textFileWriteLockPath(filepath), async () => {
      const note = await readNoteAtPath(root, normalizedPath, input.id)
      const currentVersion = textContentVersion(note.content)
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new NotesError(409, "Note changed on disk. Reload or overwrite to continue")
      }
      const source = note.metadata ? renderNoteSource(input.content, note.metadata) : input.content
      await writeTextFileAtomic(filepath, source)
      invalidateIndexedPath(root, filepath)
      return noteDocument(await readNoteFile(root, filepath))
    })
  })
}

export async function renameNote(input: {
  path: string
  id?: string
  title: string
  expectedVersion?: string | null
}) {
  const root = await activateNotesLibraryRoot()
  return withNotesMutationLock(root, async () => {
    const resolved = await readNoteAtPath(root, input.path, input.id)
    const normalizedPath = resolved.summary.relativePath
    const sourcePath = await resolveExistingNotePath(root, normalizedPath)
    const initial = await readNoteFile(root, sourcePath)
    const title = normalizeNoteTitle(input.title, initial.summary.title)
    if (isWindowsReservedNoteTitle(title)) {
      throw new NotesError(400, "Note title is reserved by Windows")
    }
    const nextPath = path.join(path.dirname(sourcePath), `${title}${NOTE_FILE_EXTENSION}`)
    assertNotesLibraryContainment(root, nextPath)
    if (sourcePath === nextPath) return initial.summary

    return withFileLocks(
      [textFileWriteLockPath(sourcePath), textFileWriteLockPath(nextPath)],
      async () => {
        const current = await readNoteAtPath(root, normalizedPath)
        const currentVersion = textContentVersion(current.content)
        if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
          throw new NotesError(409, "Note changed on disk. Reload or overwrite to continue")
        }
        let moved = false
        try {
          await renameFileWithoutOverwrite(sourcePath, nextPath)
          moved = true
          if (current.metadata?.["buddy-generated-title"] !== undefined) {
            const metadata = { ...current.metadata }
            delete metadata["buddy-generated-title"]
            await writeTextFileAtomic(nextPath, renderNoteSource(current.content, metadata))
          }
          invalidateIndexedPath(root, sourcePath)
          invalidateIndexedPath(root, nextPath)
          return (await readNoteFile(root, nextPath)).summary
        } catch (error) {
          if (error instanceof FileRenameConflictError) {
            throw new NotesError(409, "A note with that filename already exists")
          }
          if (moved) await fsp.rename(nextPath, sourcePath).catch(() => undefined)
          throw error
        }
      },
    )
  })
}
