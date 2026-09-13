import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { isVisibleToUserTextPartInfo } from "@buddy/opencode-adapter/message-visibility"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { loadRuntimeSessionInDirectory } from "../session/orchestration/lookup"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLock } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"
import { NotesError } from "./errors"
import { activateNotesLibraryRoot, invalidateIndexedPath, scanNotes } from "./library-index"
import { createNoteFile, createNoteID } from "./library"
import {
  normalizeNoteTitle,
  readNoteFile,
  renderNoteSource,
  type BuddyNoteMetadata,
} from "./note-file"
import { ensureNotebookIdentity } from "./notebook-identity"
import type { SessionNoteCaptureResult } from "./types"

const DEFAULT_SESSION_TITLE = "Chat notes" as const
const SESSION_NOTE_HEADING = "Notes" as const

type SessionCaptureInput = {
  directory: string
  sessionID: string
} & ({ kind: "note"; text: string } | { kind: "annotation"; messageID: string; text: string })

type SessionNoteEntry =
  | { kind: "note"; text: string; capturedAt: Date }
  | { kind: "annotation"; quotedMessage: string; text: string; capturedAt: Date }

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
  if (entry.kind === "note") {
    return [`## Note — ${timestamp}`, entry.text].join("\n\n")
  }
  return [`## Annotation — ${timestamp}`, quoteMarkdown(entry.quotedMessage), entry.text].join(
    "\n\n",
  )
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
  if (!normalizedText) throw new NotesError(400, "Note text is required")

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
    const entry = renderSessionNoteEntry(
      input.kind === "annotation"
        ? {
            kind: "annotation",
            quotedMessage: annotationQuote ?? "",
            text: normalizedText,
            capturedAt: new Date(),
          }
        : { kind: "note", text: normalizedText, capturedAt: new Date() },
    )

    if (!existing) {
      created = true
      const id = createNoteID()
      return createNoteFile({
        root,
        title,
        id,
        metadata: {
          type: "buddy-session-note",
          "buddy-id": id,
          "buddy-notebook-id": notebook.id,
          notebook: notebook.name,
          "buddy-session-id": input.sessionID,
        },
        content: `# ${title} — ${SESSION_NOTE_HEADING}\n\n${entry}\n`,
      })
    }

    return withFileLock(textFileWriteLockPath(existing.filepath), async () => {
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
      invalidateIndexedPath(root, current.filepath)
      return readNoteFile(root, current.filepath)
    })
  })
  return { note: note.summary, created }
}

export function captureComposerNote(input: { directory: string; sessionID: string; text: string }) {
  return captureSession({ ...input, kind: "note" })
}

export function annotateChatMessage(input: {
  directory: string
  sessionID: string
  messageID: string
  text: string
}) {
  return captureSession({ ...input, kind: "annotation" })
}
