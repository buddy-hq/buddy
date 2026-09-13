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
  noteFilename,
  readNoteFile,
  renderNoteSource,
  replaceFirstHeading,
  type BuddyNoteMetadata,
} from "./note-file"
import {
  ensureNotebookIdentity,
  findNotebookIdentity,
  loadNotebookLabelsByID,
  type NotesNotebookIdentity,
} from "./notebook-identity"
import {
  isLexicallyReservedNotesAttachmentsPath,
  isReservedNotesAttachmentsPath,
} from "./paths"
import type { NoteDocument, NoteSummary, NotesLibraryView, BuddyNoteType } from "./types"

const DEFAULT_NOTE_TITLE = "Untitled note" as const
const NOTE_FILE_EXTENSION = ".md" as const
const NODE_ERROR_NOT_FOUND = "ENOENT" as const
const NOTES_RESERVED_ATTACHMENTS_PATH_ERROR =
  "Note path is reserved by the Attachments directory" as const
export const createNoteID = monotonicFactory()

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

export async function createNoteFile(input: {
  root: string
  title: string
  id: string
  metadata: BuddyNoteMetadata
  content: string
}) {
  await ensureNotesDirectories(input.root)
  const filepath = path.join(input.root, noteFilename(input.title, input.id))
  const source = renderNoteSource(input.content, input.metadata)
  await fsp.writeFile(filepath, source, { encoding: "utf8", flag: "wx" })
  invalidateIndexedPath(input.root, filepath)
  return readNoteFile(input.root, filepath)
}

function applyNotebookContext(summary: NoteSummary, availableNotebooks: ReadonlyMap<string, string>) {
  if (summary.kind === "plain" || !summary.notebookID) return summary
  const currentName = availableNotebooks.get(summary.notebookID)
  return {
    ...summary,
    notebook: currentName ?? summary.notebook,
    notebookAvailable: currentName !== undefined,
  }
}

export async function listNotes(directory: string): Promise<NotesLibraryView> {
  const root = await activateNotesLibraryRoot()
  const [activeNotebook, availableNotebooks, notes] = await Promise.all([
    findNotebookIdentity(directory),
    loadNotebookLabelsByID(directory),
    scanNotes(root),
  ])
  if (activeNotebook) availableNotebooks.set(activeNotebook.id, activeNotebook.name)
  const library: NotesLibraryView = {
    directory: root,
    notes: notes
      .map((note) => applyNotebookContext(note.summary, availableNotebooks))
      .toSorted((left, right) => right.updatedAt - left.updatedAt),
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
    id,
    metadata: noteMetadata({ type: "buddy-note", id, notebook }),
    content: `# ${title}\n\n`,
  })
  return created.summary
}

async function readNoteAtPath(root: string, relativePath: string) {
  const normalizedPath = normalizeNotePath(relativePath)
  const filepath = await resolveExistingNotePath(root, normalizedPath)
  return readNoteFile(root, filepath)
}

export async function readNote(relativePath: string): Promise<NoteDocument> {
  const root = await activateNotesLibraryRoot()
  const note = await readNoteAtPath(root, relativePath)
  return {
    note: note.summary,
    content: note.content,
    version: textContentVersion(note.source) ?? "",
  }
}

export async function updateNote(input: {
  path: string
  content: string
  expectedVersion?: string | null
}): Promise<NoteDocument> {
  const root = await activateNotesLibraryRoot()
  const normalizedPath = normalizeNotePath(input.path)
  const filepath = await resolveExistingNotePath(root, normalizedPath)
  return withFileLock(textFileWriteLockPath(filepath), async () => {
    const note = await readNoteAtPath(root, normalizedPath)
    const currentVersion = textContentVersion(note.source)
    if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
      throw new NotesError(409, "Note changed on disk. Reload or overwrite to continue")
    }
    const source = note.metadata ? renderNoteSource(input.content, note.metadata) : input.content
    await writeTextFileAtomic(filepath, source)
    invalidateIndexedPath(root, filepath)
    const updated = await readNoteFile(root, filepath)
    return {
      note: updated.summary,
      content: updated.content,
      version: textContentVersion(updated.source) ?? "",
    }
  })
}

export async function renameNote(input: {
  path: string
  title: string
  expectedVersion?: string | null
}) {
  const root = await activateNotesLibraryRoot()
  const normalizedPath = normalizeNotePath(input.path)
  const sourcePath = await resolveExistingNotePath(root, normalizedPath)
  const initial = await readNoteFile(root, sourcePath)
  const title = normalizeNoteTitle(input.title, initial.summary.title)
  const nextFilename = initial.summary.id
    ? noteFilename(title, initial.summary.id)
    : `${title}${NOTE_FILE_EXTENSION}`
  if (!initial.summary.id && isWindowsReservedNoteTitle(title)) {
    throw new NotesError(400, "Note title is reserved by Windows")
  }
  const nextPath = path.join(path.dirname(sourcePath), nextFilename)
  assertNotesLibraryContainment(root, nextPath)
  if (sourcePath === nextPath) return initial.summary

  return withFileLocks(
    [textFileWriteLockPath(sourcePath), textFileWriteLockPath(nextPath)],
    async () => {
      const current = await readNoteAtPath(root, normalizedPath)
      const currentVersion = textContentVersion(current.source)
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new NotesError(409, "Note changed on disk. Reload or overwrite to continue")
      }
      const nextSource = current.metadata
        ? renderNoteSource(replaceFirstHeading(current.content, title), current.metadata)
        : current.source
      let moved = false
      try {
        await renameFileWithoutOverwrite(sourcePath, nextPath)
        moved = true
        if (nextSource !== current.source) await writeTextFileAtomic(nextPath, nextSource)
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
}
