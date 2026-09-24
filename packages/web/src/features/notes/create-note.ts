import { appQueryClient } from "@/state/query-client"
import { createNote } from "./api"
import { invalidateNotesQueries, publishNoteSummary } from "./queries"

const notesAwaitingTitle = new Set<string>()

export function takeNewNoteTitleSelection(id: string) {
  return notesAwaitingTitle.delete(id)
}

/** Creates a note and applies the cache sequence shared by every New Note entry point. */
export async function createNoteAndUpdateCache(directory: string) {
  const note = await createNote({ directory })
  if (note.id) notesAwaitingTitle.add(note.id)
  await publishNoteSummary(appQueryClient, note)
  void invalidateNotesQueries(appQueryClient)
  return note
}
