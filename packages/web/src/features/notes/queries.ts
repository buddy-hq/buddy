import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  listNotes,
  readNoteDocument,
  type NoteDocument,
  type NoteSummary,
  type NotesLibrary,
} from "./api"

const BUDDY_NOTES_QUERY_SCOPE = "buddy-notes" as const
const BUDDY_NOTES_STALE_TIME_MS = 30_000

export const notesQueryKeys = {
  all: () => [BUDDY_NOTES_QUERY_SCOPE] as const,
  libraries: () => [BUDDY_NOTES_QUERY_SCOPE, "library"] as const,
  library: (directory: string) => [...notesQueryKeys.libraries(), directory] as const,
  notes: () => [BUDDY_NOTES_QUERY_SCOPE, "note"] as const,
  note: (path: string) => [...notesQueryKeys.notes(), path] as const,
}

export function notesLibraryQueryOptions(directory: string) {
  return queryOptions({
    queryKey: notesQueryKeys.library(directory),
    queryFn: async () => listNotes(directory),
    staleTime: BUDDY_NOTES_STALE_TIME_MS,
  })
}

export function noteQueryOptions(path: string) {
  return queryOptions({
    queryKey: notesQueryKeys.note(path),
    queryFn: async () => readNoteDocument({ path }),
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

function contextualNoteSummary(library: NotesLibrary, note: NoteSummary, previousPath?: string) {
  const identityPath = previousPath ?? note.relativePath
  const previous = library.notes.find((candidate) => candidate.relativePath === identityPath)
  if (previous?.kind === "buddy" && note.kind === "buddy") {
    return {
      ...note,
      ...(previous.notebook ? { notebook: previous.notebook } : undefined),
      ...(previous.notebookAvailable !== undefined
        ? { notebookAvailable: previous.notebookAvailable }
        : undefined),
    }
  }
  if (note.kind === "buddy") {
    return {
      ...note,
      notebookAvailable:
        note.notebookID !== undefined && library.activeNotebookID === note.notebookID,
    }
  }
  return note
}

function cacheBuddyNoteSummary(queryClient: QueryClient, note: NoteSummary, previousPath?: string) {
  queryClient.setQueriesData<NotesLibrary>({ queryKey: notesQueryKeys.libraries() }, (library) => {
    if (!library) return library
    const identityPath = previousPath ?? note.relativePath
    const contextualNote = contextualNoteSummary(library, note, previousPath)
    const notes = library.notes.some((candidate) => candidate.relativePath === identityPath)
      ? library.notes.map((candidate) =>
          candidate.relativePath === identityPath ? contextualNote : candidate,
        )
      : [...library.notes, contextualNote]
    return {
      ...library,
      notes: notes.toSorted((left, right) => right.updatedAt - left.updatedAt),
    }
  })
  queryClient.setQueryData<NoteDocument>(notesQueryKeys.note(note.relativePath), (document) =>
    document ? { ...document, note } : document,
  )
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
    queryClient.removeQueries({
      queryKey: notesQueryKeys.note(previousPath),
      exact: true,
    })
  }
  queryClient.setQueryData(notesQueryKeys.note(document.note.relativePath), document)
  cacheBuddyNoteSummary(queryClient, document.note, previousPath)
}
