import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  listNotes,
  readNoteDocument,
  readSessionNote,
  type NoteDocument,
  type NoteSummary,
  type NotesLibrary,
  type SessionNoteLookup,
} from "./api"

const BUDDY_NOTES_QUERY_SCOPE = "buddy-notes" as const
const BUDDY_NOTES_STALE_TIME_MS = 30_000

export const notesQueryKeys = {
  all: () => [BUDDY_NOTES_QUERY_SCOPE] as const,
  libraries: () => [BUDDY_NOTES_QUERY_SCOPE, "library"] as const,
  library: (directory: string) => [...notesQueryKeys.libraries(), directory] as const,
  notes: () => [BUDDY_NOTES_QUERY_SCOPE, "note"] as const,
  note: (path: string, id?: string) => [...notesQueryKeys.notes(), id ?? path] as const,
  search: (directory: string, query: string) =>
    [BUDDY_NOTES_QUERY_SCOPE, "search", directory, query] as const,
  searches: () => [BUDDY_NOTES_QUERY_SCOPE, "search"] as const,
  sessionNote: (sessionID: string) => [BUDDY_NOTES_QUERY_SCOPE, "session", sessionID] as const,
}

export function notesLibraryQueryOptions(directory: string, query = "") {
  return queryOptions({
    queryKey: query ? notesQueryKeys.search(directory, query) : notesQueryKeys.library(directory),
    queryFn: async () => listNotes(directory, query),
    staleTime: BUDDY_NOTES_STALE_TIME_MS,
  })
}

export function sessionNoteQueryOptions(sessionID: string) {
  return queryOptions({
    queryKey: notesQueryKeys.sessionNote(sessionID),
    queryFn: async () => readSessionNote(sessionID),
    staleTime: BUDDY_NOTES_STALE_TIME_MS,
  })
}

export function noteQueryOptions(path: string, id?: string) {
  return queryOptions({
    queryKey: notesQueryKeys.note(path, id),
    queryFn: async () => readNoteDocument({ path, id }),
    staleTime: BUDDY_NOTES_STALE_TIME_MS,
  })
}

export async function invalidateNotesQueries(
  queryClient: QueryClient,
  refetchType: "active" | "none" = "active",
) {
  await queryClient.invalidateQueries({
    queryKey: notesQueryKeys.all(),
    refetchType,
  })
}

export async function resetNotesQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: notesQueryKeys.all() })
  queryClient.removeQueries({ queryKey: notesQueryKeys.all() })
}

function contextualNoteSummary(library: NotesLibrary, note: NoteSummary, previous?: NoteSummary) {
  const summary =
    note.preview === undefined && previous?.preview !== undefined
      ? { ...note, preview: previous.preview }
      : note
  if (previous?.kind === "buddy" && summary.kind === "buddy") {
    return {
      ...summary,
      ...(previous.notebook ? { notebook: previous.notebook } : undefined),
      ...(previous.notebookAvailable !== undefined
        ? { notebookAvailable: previous.notebookAvailable }
        : undefined),
    }
  }
  if (summary.kind === "buddy") {
    return {
      ...summary,
      notebookAvailable:
        summary.notebookID !== undefined && library.activeNotebookID === summary.notebookID,
    }
  }
  return summary
}

function cacheBuddyNoteSummary(queryClient: QueryClient, note: NoteSummary, previousPath?: string) {
  queryClient.setQueriesData<NotesLibrary>({ queryKey: notesQueryKeys.libraries() }, (library) => {
    if (!library) return library
    const identityPath = previousPath ?? note.relativePath
    const matchesIdentity = (candidate: NoteSummary) =>
      note.id ? candidate.id === note.id : candidate.relativePath === identityPath
    const contextualNote = contextualNoteSummary(library, note, library.notes.find(matchesIdentity))
    const notes = library.notes.some(matchesIdentity)
      ? library.notes.map((candidate) => (matchesIdentity(candidate) ? contextualNote : candidate))
      : [...library.notes, contextualNote]
    return {
      ...library,
      notes: notes.toSorted((left, right) => right.updatedAt - left.updatedAt),
    }
  })
  queryClient.setQueryData<NoteDocument>(
    notesQueryKeys.note(note.relativePath, note.id),
    (document) => (document ? { ...document, note } : document),
  )
  if (note.type === "buddy-session-note" && note.sessionID) {
    queryClient.setQueryData<SessionNoteLookup>(notesQueryKeys.sessionNote(note.sessionID), {
      note,
    })
  }
}

export async function invalidateNotesSearchQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: notesQueryKeys.searches(),
    refetchType: "active",
  })
}

export async function publishNoteSummary(queryClient: QueryClient, note: NoteSummary) {
  await queryClient.cancelQueries({ queryKey: notesQueryKeys.all() })
  cacheBuddyNoteSummary(queryClient, note)
}

export async function cacheNoteDocument(
  queryClient: QueryClient,
  document: NoteDocument,
  previousPath?: string,
) {
  await queryClient.cancelQueries({ queryKey: notesQueryKeys.all() })
  if (previousPath && previousPath !== document.note.relativePath) {
    if (!document.note.id) {
      queryClient.removeQueries({
        queryKey: notesQueryKeys.note(previousPath),
        exact: true,
      })
    }
  }
  queryClient.setQueryData(
    notesQueryKeys.note(document.note.relativePath, document.note.id),
    document,
  )
  cacheBuddyNoteSummary(queryClient, document.note, previousPath)
}
