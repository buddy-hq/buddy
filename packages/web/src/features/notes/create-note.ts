import { appQueryClient } from "@/state/query-client"
import { createNote } from "./api"
import { invalidateNotesQueries, publishNoteSummary } from "./queries"

/** Creates a note and applies the cache sequence shared by every New Note entry point. */
export async function createNoteAndUpdateCache(directory: string) {
  const note = await createNote({ directory })
  await publishNoteSummary(appQueryClient, note)
  void invalidateNotesQueries(appQueryClient)
  return note
}
