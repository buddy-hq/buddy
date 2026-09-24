import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { invalidateNotesBenchTargets } from "@/lib/directory-workspace-notes"
import { appQueryClient } from "@/state/query-client"
import type { NotesBenchTarget } from "@/state/directory-workspace-store"
import {
  readNoteLocation,
  type NotesLibrary,
  type NoteSummary,
  type SessionNoteLookup,
} from "./api"
import { invalidateNotesQueries, notesQueryKeys } from "./queries"

const DELETE_UNDO_WINDOW_MS = 8_000

function isSameNote(candidate: NoteSummary, note: NoteSummary) {
  return note.id ? candidate.id === note.id : candidate.relativePath === note.relativePath
}

function hideNoteFromLists(note: NoteSummary) {
  const hide = (library: NotesLibrary | undefined) =>
    library
      ? { ...library, notes: library.notes.filter((candidate) => !isSameNote(candidate, note)) }
      : library
  appQueryClient.setQueriesData<NotesLibrary>({ queryKey: notesQueryKeys.libraries() }, hide)
  appQueryClient.setQueriesData<NotesLibrary>({ queryKey: notesQueryKeys.searches() }, hide)
  if (note.type === "buddy-session-note" && note.sessionID) {
    appQueryClient.setQueryData<SessionNoteLookup>(notesQueryKeys.sessionNote(note.sessionID), {})
  }
}

export function deleteNoteWithUndo(input: {
  note: NoteSummary
  trashNoteFile: (path: string) => Promise<void>
  closeOpenTab?: () => void
  reopen?: () => void
}) {
  const { note } = input
  const matchesNote = (target: NotesBenchTarget) =>
    (note.id !== undefined && target.id === note.id) || target.path === note.relativePath
  let settled = false

  async function commit() {
    if (settled) return
    settled = true
    let trashed = false
    try {
      const location = await readNoteLocation({ path: note.relativePath, id: note.id })
      await input.trashNoteFile(location.filepath)
      trashed = true
      await invalidateNotesBenchTargets({ matches: matchesNote })
    } catch {
      toast.error(language.t("notes.delete.failed"))
      if (!trashed) input.reopen?.()
    } finally {
      await invalidateNotesQueries(appQueryClient)
    }
  }

  function undo() {
    if (settled) return
    settled = true
    void invalidateNotesQueries(appQueryClient)
    input.reopen?.()
  }

  void appQueryClient.cancelQueries({ queryKey: notesQueryKeys.all() }).then(() => {
    if (!settled) hideNoteFromLists(note)
  })
  input.closeOpenTab?.()
  toast(language.t("notes.toast.deleted", { name: note.title }), {
    duration: DELETE_UNDO_WINDOW_MS,
    action: { label: language.t("notes.action.undo"), onClick: undo },
    onAutoClose: () => void commit(),
    onDismiss: () => void commit(),
  })
}
