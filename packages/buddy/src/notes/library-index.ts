import fsp from "node:fs/promises"
import { watch, type FSWatcher } from "node:fs"
import path from "node:path"
import { parseNodeErrorCode } from "../storage/parse-node-error"
import { isReservedNotesAttachmentsPath, resolveNotesAttachmentsDirectory } from "./paths"
import { readNotesDirectoryState } from "./settings"
import { parseNoteFile, type ParsedNoteFile } from "./note-file"

const NOTE_FILE_EXTENSION = ".md" as const
const NODE_ERROR_NOT_FOUND = "ENOENT" as const
const NOTES_SCAN_CONCURRENCY = 32
const NOTES_SCAN_MAX_PASSES = 2

type ScannedNoteCacheEntry = {
  ctimeMs: number
  mtimeMs: number
  size: number
  note: ParsedNoteFile
}

type NotesLibraryIndex = {
  files: Map<string, ScannedNoteCacheEntry>
  initialized: boolean
  dirty: boolean
  watcher?: FSWatcher
  watcherUnavailable: boolean
}

const scanTails = new Map<string, Promise<ParsedNoteFile[]>>()
const libraryIndexes = new Map<string, NotesLibraryIndex>()
let activeNotesRoot: string | undefined

export async function activateNotesLibraryRoot() {
  const root = (await readNotesDirectoryState()).resolvedDirectory
  if (activeNotesRoot && activeNotesRoot !== root) {
    libraryIndexes.get(activeNotesRoot)?.watcher?.close()
    libraryIndexes.delete(activeNotesRoot)
  }
  activeNotesRoot = root
  return root
}

export async function ensureNotesDirectories(root: string) {
  await Promise.all([
    fsp.mkdir(root, { recursive: true }),
    fsp.mkdir(resolveNotesAttachmentsDirectory(root), { recursive: true }),
  ])
  const index = indexForRoot(root)
  if (!index.watcher) {
    index.watcherUnavailable = false
    ensureLibraryWatcher(root, index)
  }
}

function indexForRoot(root: string) {
  const existing = libraryIndexes.get(root)
  if (existing) return existing
  const created: NotesLibraryIndex = {
    files: new Map(),
    initialized: false,
    dirty: true,
    watcherUnavailable: false,
  }
  libraryIndexes.set(root, created)
  return created
}

function ensureLibraryWatcher(root: string, index: NotesLibraryIndex) {
  if (activeNotesRoot !== root || index.watcher || index.watcherUnavailable) return
  try {
    index.watcher = watch(root, { recursive: true }, () => {
      index.dirty = true
    })
    index.watcher.unref()
  } catch {
    index.watcherUnavailable = true
  }
}

async function collectMarkdownFiles(root: string) {
  const files: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    if (!directory) break
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch((error) => {
      if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return []
      throw error
    })
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue
      const filepath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (directory === root && (await isReservedNotesAttachmentsPath(root, filepath))) continue
        pending.push(filepath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(NOTE_FILE_EXTENSION)) {
        files.push(filepath)
      }
    }
  }
  return files
}

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  task: (item: TItem) => Promise<TResult>,
) {
  const results = Array<TResult>(items.length)
  let nextIndex = 0
  const worker = async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await task(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function readIndexedNoteFile(input: {
  root: string
  filepath: string
  previousFiles: ReadonlyMap<string, ScannedNoteCacheEntry>
  nextFiles: Map<string, ScannedNoteCacheEntry>
}) {
  const stat = await fsp.stat(input.filepath)
  const cached = input.previousFiles.get(input.filepath)
  if (
    cached &&
    cached.ctimeMs === stat.ctimeMs &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size
  ) {
    input.nextFiles.set(input.filepath, cached)
    return cached.note
  }
  const source = await fsp.readFile(input.filepath, "utf8")
  const note = parseNoteFile({
    root: input.root,
    filepath: input.filepath,
    source,
    updatedAt: stat.mtimeMs,
  })
  input.nextFiles.set(input.filepath, {
    ctimeMs: stat.ctimeMs,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    note,
  })
  return note
}

async function scanNotesPass(root: string, index: NotesLibraryIndex): Promise<ParsedNoteFile[]> {
  index.dirty = false
  const files = (await collectMarkdownFiles(root)).toSorted()
  const previousFiles = index.files
  const nextFiles = new Map<string, ScannedNoteCacheEntry>()
  const notes = await mapWithConcurrency(files, NOTES_SCAN_CONCURRENCY, (filepath) =>
    readIndexedNoteFile({ root, filepath, previousFiles, nextFiles }).catch(() => undefined),
  )
  if (libraryIndexes.get(root) !== index || activeNotesRoot !== root) {
    return notes.filter((note): note is ParsedNoteFile => note !== undefined)
  }
  index.files = nextFiles
  index.initialized = true
  ensureLibraryWatcher(root, index)
  return notes.filter((note): note is ParsedNoteFile => note !== undefined)
}

async function scanNotesUntilSettled(root: string, index: NotesLibraryIndex) {
  let notes: ParsedNoteFile[] = []
  for (let pass = 0; pass < NOTES_SCAN_MAX_PASSES; pass += 1) {
    notes = await scanNotesPass(root, index)
    if (!index.dirty || libraryIndexes.get(root) !== index || activeNotesRoot !== root) {
      break
    }
    // A watcher event may arrive after a cached entry was copied into the private snapshot.
    // Drop the cache before the bounded retry so unchanged stat metadata cannot retain stale text.
    index.files.clear()
  }
  return notes
}

export async function scanNotes(root: string): Promise<ParsedNoteFile[]> {
  const existing = scanTails.get(root)
  if (existing) return existing

  const index = indexForRoot(root)
  if (index.initialized && !index.dirty && !index.watcherUnavailable) {
    return [...index.files.values()]
      .map((entry) => entry.note)
      .toSorted((left, right) => left.filepath.localeCompare(right.filepath))
  }

  const scan = scanNotesUntilSettled(root, index)
  scanTails.set(root, scan)
  try {
    return await scan
  } finally {
    if (scanTails.get(root) === scan) scanTails.delete(root)
  }
}

export function invalidateIndexedPath(root: string, filepath: string) {
  const index = indexForRoot(root)
  index.files.delete(filepath)
  index.dirty = true
}
