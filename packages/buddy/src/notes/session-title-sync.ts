import path from "node:path"
import z from "zod"
import { publishGlobalEvent, subscribeGlobalEvent } from "@buddy/opencode-adapter/global-event"
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
  renderNoteSource,
} from "./note-file"
import { sessionNoteTitle } from "./presentation"
import { withNotesMutationLock } from "./mutation-lock"

export const NOTES_LIBRARY_UPDATED_EVENT_TYPE = "notes.library.updated" as const
const QUEUED_TITLE_SESSION_LIMIT = 256

const SessionTitleEvent = z.object({
  type: z.literal("session.updated"),
  properties: z.object({
    info: z.object({ id: z.string(), title: z.string(), time: z.object({ created: z.number() }) }),
  }),
})

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
              renderNoteSource(moved.content, {
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
  return subscribeGlobalEvent((event) => {
    const parsed = SessionTitleEvent.safeParse(event.payload)
    if (!parsed.success) return
    const session = parsed.data.properties.info
    const directory = event.directory
    if (queuedTitleBySessionID.get(session.id) === session.title) return
    queuedTitleBySessionID.delete(session.id)
    queuedTitleBySessionID.set(session.id, session.title)
    const oldestSessionID = queuedTitleBySessionID.keys().next().value
    if (queuedTitleBySessionID.size > QUEUED_TITLE_SESSION_LIMIT && oldestSessionID) {
      queuedTitleBySessionID.delete(oldestSessionID)
    }
    pending = pending
      .then(() =>
        synchronizeSessionNoteTitle({
          sessionID: session.id,
          title: session.title,
          createdAt: session.time.created,
        }),
      )
      .then((renamed) => {
        if (!renamed || !directory) return
        publishGlobalEvent({
          directory,
          payload: { type: NOTES_LIBRARY_UPDATED_EVENT_TYPE, properties: {} },
        })
      })
      .catch((error) => {
        if (queuedTitleBySessionID.get(session.id) === session.title) {
          queuedTitleBySessionID.delete(session.id)
        }
        console.error("Could not update the chat note title", {
          sessionID: session.id,
          error: errorMessage(error),
        })
      })
  })
}
