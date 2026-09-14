import fsp from "node:fs/promises"
import path from "node:path"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { isVisibleToUserTextPartInfo } from "@buddy/opencode-adapter/message-visibility"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { loadRuntimeSessionInDirectory } from "../session/orchestration/lookup"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLock } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"
import { NotesError } from "./errors"
import {
  activateNotesLibraryRoot,
  ensureNotesDirectories,
  invalidateIndexedPath,
  scanNotes,
} from "./library-index"
import { createNoteFile, createNoteID } from "./library"
import {
  normalizeNoteTitle,
  readNoteFile,
  renderNoteSource,
  toPosixRelativePath,
  type BuddyNoteMetadata,
} from "./note-file"
import { ensureNotebookIdentity } from "./notebook-identity"
import { resolveNotesAttachmentsDirectory } from "./paths"
import { NOTE_CAPTURE_MAX_IMAGE_BYTES } from "./types"
import type { NoteCaptureImage, NoteCaptureImageMime, SessionNoteCaptureResult } from "./types"

const DEFAULT_SESSION_TITLE = "Chat notes" as const
const DEFAULT_IMAGE_ALT = "Image" as const
const IMAGE_ALT_UNSAFE_CHARACTERS = /[[\]\\\r\n]/g
const IMAGE_FILE_EXTENSIONS = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<NoteCaptureImageMime, string>

type SessionCaptureInput = {
  directory: string
  sessionID: string
  text: string
  images?: NoteCaptureImage[]
} & ({ kind: "note" } | { kind: "annotation"; messageID: string })

type SessionNoteEntry = { text: string; imageLinks: string[]; capturedAt: Date } & (
  | { kind: "note" }
  | { kind: "annotation"; quotedMessage: string }
)

type SavedCaptureImage = { image: NoteCaptureImage; filepath: string }

const mutationTails = new Map<string, Promise<void>>()

async function withMutationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = mutationTails.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  mutationTails.set(key, tail)
  try {
    return await run
  } finally {
    if (mutationTails.get(key) === tail) mutationTails.delete(key)
  }
}

function captureTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function quoteMarkdown(text: string) {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

function renderSessionNoteEntry(entry: SessionNoteEntry) {
  const timestamp = captureTimestamp(entry.capturedAt)
  const body = [entry.text, ...entry.imageLinks].filter(Boolean)
  if (entry.kind === "note") {
    return [`## Note — ${timestamp}`, ...body].join("\n\n")
  }
  return [`## Annotation — ${timestamp}`, quoteMarkdown(entry.quotedMessage), ...body].join("\n\n")
}

function imageLink(saved: SavedCaptureImage, noteDirectory: string) {
  const alt =
    saved.image.filename.replaceAll(IMAGE_ALT_UNSAFE_CHARACTERS, " ").trim() || DEFAULT_IMAGE_ALT
  return `![${alt}](${toPosixRelativePath(noteDirectory, saved.filepath)})`
}

async function removeCaptureImages(saved: readonly SavedCaptureImage[]) {
  const results = await Promise.allSettled(
    saved.map((entry) => fsp.rm(entry.filepath, { force: true })),
  )
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
}

function reportCaptureImageCleanupFailures(failures: readonly unknown[]) {
  if (failures.length === 0) return
  console.error(
    "Failed to clean up captured note images; preserving the original operation error.",
    new AggregateError(failures),
  )
}

async function rollbackCaptureImages<TError>(
  saved: readonly SavedCaptureImage[],
  operationError: TError,
): Promise<never> {
  reportCaptureImageCleanupFailures(await removeCaptureImages(saved))
  throw operationError
}

async function writeCaptureImage(input: {
  attachmentsDirectory: string
  image: NoteCaptureImage
  bytes: Buffer
}): Promise<SavedCaptureImage> {
  const filename = `${createNoteID()}.${IMAGE_FILE_EXTENSIONS[input.image.mime]}`
  const filepath = path.join(input.attachmentsDirectory, filename)
  let file: Awaited<ReturnType<typeof fsp.open>> | undefined
  try {
    file = await fsp.open(filepath, "wx")
    await file.writeFile(input.bytes)
    await file.close()
    file = undefined
    return { image: input.image, filepath }
  } catch (error) {
    if (file) {
      await file.close().catch(() => undefined)
      reportCaptureImageCleanupFailures(
        await removeCaptureImages([{ image: input.image, filepath }]),
      )
    }
    throw error
  }
}

/** Writes captured images into the reserved Attachments folder under new unique names. */
async function writeCaptureImages(root: string, images: NoteCaptureImage[]) {
  if (images.length === 0) return []

  const saved: SavedCaptureImage[] = []
  let attachmentsDirectory: string | undefined
  for (const image of images) {
    const bytes = Buffer.from(image.data, "base64")
    if (bytes.length === 0) {
      return rollbackCaptureImages(saved, new NotesError(400, "Image data is empty"))
    }
    if (bytes.length > NOTE_CAPTURE_MAX_IMAGE_BYTES) {
      return rollbackCaptureImages(saved, new NotesError(400, "Image exceeds the size limit"))
    }
    if (!attachmentsDirectory) {
      await ensureNotesDirectories(root)
      attachmentsDirectory = resolveNotesAttachmentsDirectory(root)
    }
    try {
      saved.push(await writeCaptureImage({ attachmentsDirectory, image, bytes }))
    } catch (error) {
      return rollbackCaptureImages(saved, error)
    }
  }
  return saved
}

function readableMessageText(
  message: Awaited<ReturnType<typeof OpenCodeSession.messages>>[number],
) {
  return message.parts
    .flatMap((part) => {
      if (
        part.type !== "text" ||
        !isVisibleToUserTextPartInfo(part) ||
        part.text.trim().length === 0
      ) {
        return []
      }
      return [part.text.trim()]
    })
    .join("\n\n")
}

async function loadSessionMessages(directory: string, sessionID: string) {
  const runtimeSessionID = SessionID.make(sessionID)
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeSession.messages({ sessionID: runtimeSessionID }),
  })
}

async function captureSession(input: SessionCaptureInput): Promise<SessionNoteCaptureResult> {
  const session = await loadRuntimeSessionInDirectory(input.directory, input.sessionID)
  if (!session) throw new NotesError(404, "Chat not found")
  const normalizedText = input.text.trim()
  const images = input.images ?? []
  if (!normalizedText && images.length === 0) {
    throw new NotesError(400, "Note text or an image is required")
  }

  let annotationQuote: string | undefined
  if (input.kind === "annotation") {
    const messages = await loadSessionMessages(input.directory, input.sessionID)
    const message = messages.find((candidate) => candidate.info.id === input.messageID)
    annotationQuote = message ? readableMessageText(message) : undefined
    if (!annotationQuote) throw new NotesError(404, "Chat message not found")
  }

  const [root, notebook] = await Promise.all([
    activateNotesLibraryRoot(),
    ensureNotebookIdentity(input.directory),
  ])
  const title = normalizeNoteTitle(session.title, DEFAULT_SESSION_TITLE)
  let created = false
  const note = await withMutationLock(root, async () => {
    const existing = (await scanNotes(root)).find(
      (candidate) =>
        candidate.summary.kind === "buddy" &&
        candidate.summary.type === "buddy-session-note" &&
        candidate.summary.sessionID === input.sessionID,
    )
    // New session notes are created at the library root; image links are relative to the note.
    const noteDirectory = existing ? path.dirname(existing.filepath) : root
    const savedImages = await writeCaptureImages(root, images)
    let noteCommitted = false
    try {
      const entryContent = {
        text: normalizedText,
        imageLinks: savedImages.map((saved) => imageLink(saved, noteDirectory)),
        capturedAt: new Date(),
      }
      const entry = renderSessionNoteEntry(
        input.kind === "annotation"
          ? { ...entryContent, kind: "annotation", quotedMessage: annotationQuote ?? "" }
          : { ...entryContent, kind: "note" },
      )

      if (!existing) {
        created = true
        const id = createNoteID()
        return await createNoteFile({
          root,
          title,
          metadata: {
            type: "buddy-session-note",
            "buddy-id": id,
            "buddy-notebook-id": notebook.id,
            notebook: notebook.name,
            "buddy-session-id": input.sessionID,
          },
          content: `${entry}\n`,
          onCommitted: () => {
            noteCommitted = true
          },
        })
      }

      return await withFileLock(textFileWriteLockPath(existing.filepath), async () => {
        const current = await readNoteFile(root, existing.filepath)
        if (
          current.summary.kind !== "buddy" ||
          current.summary.type !== "buddy-session-note" ||
          current.summary.sessionID !== input.sessionID ||
          !current.metadata
        ) {
          throw new NotesError(409, "Session note changed on disk. Try again")
        }
        const metadata: BuddyNoteMetadata = {
          ...current.metadata,
          notebook: notebook.name,
          "buddy-notebook-id": notebook.id,
        }
        const nextContent = `${current.content.trimEnd()}\n\n${entry}\n`
        await writeTextFileAtomic(current.filepath, renderNoteSource(nextContent, metadata))
        noteCommitted = true
        invalidateIndexedPath(root, current.filepath)
        return readNoteFile(root, current.filepath)
      })
    } catch (error) {
      if (!noteCommitted) return rollbackCaptureImages(savedImages, error)
      throw error
    }
  })
  return { note: note.summary, created }
}

export function captureComposerNote(input: {
  directory: string
  sessionID: string
  text: string
  images?: NoteCaptureImage[]
}) {
  return captureSession({ ...input, kind: "note" })
}

export function annotateChatMessage(input: {
  directory: string
  sessionID: string
  messageID: string
  text: string
  images?: NoteCaptureImage[]
}) {
  return captureSession({ ...input, kind: "annotation" })
}
