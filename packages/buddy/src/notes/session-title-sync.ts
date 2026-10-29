import path from "node:path"
import { publishGlobalEvent } from "@buddy/backend/events/buddy-event-bus"
import { getAgentRuntime } from "../runtime/agent-runtime"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLocks } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"
import {
  FileRenameConflictError,
  renameFileWithoutOverwrite,
} from "../storage/rename-file-without-overwrite"
import { activateNotesLibraryRoot, invalidateIndexedPath, scanNotes } from "./library-index"
import {
  isWindowsReservedNoteTitle,
  normalizeNoteTitle,
  readNoteFile,
  replaceNoteMetadata,
} from "./note-file"
import { sessionNoteTitle } from "./presentation"
import { withNotesMutationLock } from "./mutation-lock"

export const NOTES_LIBRARY_UPDATED_EVENT_TYPE = "notes.library.updated" as const
const QUEUED_TITLE_SESSION_LIMIT = 256

function errorMessage<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

/** Follow chat titles only while the filename is still the one Buddy generated. */
export async function synchronizeSessionNoteTitle(input: {
  sessionID: string
  title: string
  createdAt: number
}): Promise<boolean> {
  const root = await activateNotesLibraryRoot()
  return withNotesMutationLock(root, async () => {
    const note = (await scanNotes(root)).find(
      (candidate) =>
        candidate.summary.type === "buddy-session-note" &&
        candidate.summary.sessionID === input.sessionID,
    )
    const generatedTitle = note?.metadata?.["buddy-generated-title"]
    // Old notes have no ownership marker. Their names may have been chosen by the user.
    if (!note || generatedTitle === undefined || generatedTitle !== note.summary.title) return false
    const title = normalizeNoteTitle(sessionNoteTitle(input.title, input.createdAt), "Chat notes")
    if (title === generatedTitle) return false

    for (let copy = 0; copy < 1_000; copy += 1) {
      const stem = copy === 0 ? title : `${title} ${copy}`
      if (isWindowsReservedNoteTitle(stem)) continue
      const destination = path.join(path.dirname(note.filepath), `${stem}.md`)
      if (destination === note.filepath) return false
      const outcome = await withFileLocks(
        [textFileWriteLockPath(note.filepath), textFileWriteLockPath(destination)],
        async () => {
          const current = await readNoteFile(root, note.filepath)
          if (
            !current.metadata ||
            current.summary.id !== note.summary.id ||
            current.metadata["buddy-generated-title"] !== current.summary.title
          ) {
            return "skipped"
          }
          try {
            await renameFileWithoutOverwrite(current.filepath, destination)
          } catch (error) {
            if (error instanceof FileRenameConflictError) return "collision"
            throw error
          }
          invalidateIndexedPath(root, current.filepath)
          invalidateIndexedPath(root, destination)
          try {
            // Re-read after the move so a writer that completed before the rename is never
            // replaced with the snapshot taken above.
            const moved = await readNoteFile(root, destination)
            if (!moved.metadata) return "renamed"
            await writeTextFileAtomic(
              destination,
              replaceNoteMetadata(moved, {
                ...moved.metadata,
                "buddy-generated-title": stem,
              }),
            )
          } catch (error) {
            await renameFileWithoutOverwrite(destination, current.filepath)
            throw error
          } finally {
            invalidateIndexedPath(root, current.filepath)
            invalidateIndexedPath(root, destination)
          }
          return "renamed"
        },
      )
      if (outcome === "skipped") return false
      if (outcome === "renamed") return true
    }
    return false
  })
}

/** Own title-event subscriptions for the lifetime of a backend listener. */
export function startSessionNoteTitleSync(): () => void {
  let pending = Promise.resolve()
  const queuedTitleBySessionID = new Map<string, string>()
  const controller = new AbortController()
  const subscribe = async () => {
    const runtime = await getAgentRuntime()
    if (controller.signal.aborted) return
    for await (const event of runtime.events.signals({ signal: controller.signal })) {
      if (event.type !== "conversation.renamed") continue
      const { sessionID, title, directory } = event
      if (queuedTitleBySessionID.get(sessionID) === title) continue
      queuedTitleBySessionID.delete(sessionID)
      queuedTitleBySessionID.set(sessionID, title)
      const oldestSessionID = queuedTitleBySessionID.keys().next().value
      if (queuedTitleBySessionID.size > QUEUED_TITLE_SESSION_LIMIT && oldestSessionID) queuedTitleBySessionID.delete(oldestSessionID)
      pending = pending.then(async () => {
        if (controller.signal.aborted) return
        const session = await runtime.conversations.get(sessionID)
        const renamed = await synchronizeSessionNoteTitle({ sessionID, title: session.title ?? title, createdAt: session.time.created })
        if (renamed && directory) publishGlobalEvent({ directory, payload: { type: NOTES_LIBRARY_UPDATED_EVENT_TYPE, properties: {} } })
      }).catch((error) => {
        if (queuedTitleBySessionID.get(sessionID) === title) queuedTitleBySessionID.delete(sessionID)
        console.error("Could not update the chat note title", { sessionID, error: errorMessage(error) })
      })
    }
  }
  void subscribe().catch((error) => {
    if (!controller.signal.aborted) console.error("Chat note title subscription failed", { error: errorMessage(error) })
  })
  return () => controller.abort()
}
