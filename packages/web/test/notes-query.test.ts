import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import {
  cacheNoteDocument,
  invalidateNotesQueries,
  notesQueryKeys,
} from "../src/features/notes/queries"
import type { NoteDocument, NotesLibrary } from "../src/features/notes/api"

const FIRST_DIRECTORY = "/notebooks/first"
const SECOND_DIRECTORY = "/notebooks/second"
const NOTE_ID = "01M0TK829PD2067YDMZ1Y8RCBF"

function noteDocument(input: {
  title: string
  relativePath: string
  content: string
  version: string
}): NoteDocument {
  return {
    note: {
      kind: "buddy",
      id: NOTE_ID,
      type: "buddy-note",
      title: input.title,
      relativePath: input.relativePath,
      notebook: "First",
      notebookID: "01M0TK829PD2067YDMZ1Y8RCBG",
      notebookAvailable: true,
      updatedAt: 1,
    },
    content: input.content,
    version: input.version,
  }
}

describe("Buddy Notes query cache", () => {
  test("moves the global cached document and preserves each library's notebook context", async () => {
    const queryClient = new QueryClient()
    const original = noteDocument({
      title: "Before",
      relativePath: `Before — ${NOTE_ID}.md`,
      content: "# Before\n\nBody before rename.\n",
      version: "before-version",
    })
    const renamed = noteDocument({
      title: "After",
      relativePath: `After — ${NOTE_ID}.md`,
      content: "# After\n\nBody before rename.\n",
      version: "after-version",
    })
    queryClient.setQueryData<NotesLibrary>(notesQueryKeys.library(FIRST_DIRECTORY), {
      directory: "/Buddy/Notes",
      activeNotebookID: "01M0TK829PD2067YDMZ1Y8RCBG",
      notes: [original.note],
    })
    queryClient.setQueryData<NoteDocument>(
      notesQueryKeys.note(original.note.relativePath),
      original,
    )
    queryClient.setQueryData<NotesLibrary>(notesQueryKeys.library(SECOND_DIRECTORY), {
      directory: "/Buddy/Notes",
      activeNotebookID: "01M0TK829PD2067YDMZ1Y8RCBH",
      notes: [{ ...original.note, notebook: "Unavailable First", notebookAvailable: false }],
    })
    const thirdDirectory = "/notebooks/third"
    queryClient.setQueryData<NotesLibrary>(notesQueryKeys.library(thirdDirectory), {
      directory: "/Buddy/Notes",
      activeNotebookID: "01M0TK829PD2067YDMZ1Y8RCBH",
      notes: [],
    })

    await cacheNoteDocument(queryClient, renamed, original.note.relativePath)

    expect(
      queryClient.getQueryData<NoteDocument>(
        notesQueryKeys.note(renamed.note.relativePath),
      ),
    ).toEqual(renamed)
    expect(
      queryClient.getQueryData<NotesLibrary>(notesQueryKeys.library(FIRST_DIRECTORY))
        ?.notes,
    ).toEqual([renamed.note])
    expect(
      queryClient.getQueryData<NotesLibrary>(notesQueryKeys.library(SECOND_DIRECTORY))
        ?.notes,
    ).toEqual([
      {
        ...renamed.note,
        notebook: "Unavailable First",
        notebookAvailable: false,
      },
    ])
    expect(
      queryClient.getQueryData<NotesLibrary>(notesQueryKeys.library(thirdDirectory))
        ?.notes,
    ).toEqual([{ ...renamed.note, notebookAvailable: false }])
  })

  test("invalidates every notebook cache after a Notes mutation", async () => {
    const queryClient = new QueryClient()
    const document = noteDocument({
      title: "Cached",
      relativePath: `Cached — ${NOTE_ID}.md`,
      content: "# Cached\n",
      version: "cached-version",
    })
    queryClient.setQueryData(notesQueryKeys.library(FIRST_DIRECTORY), {
      directory: "/old-home/Notes",
      activeNotebookID: "01M0TK829PD2067YDMZ1Y8RCBG",
      notes: [document.note],
    } satisfies NotesLibrary)
    queryClient.setQueryData<NoteDocument>(
      notesQueryKeys.note(document.note.relativePath),
      document,
    )
    queryClient.setQueryData(notesQueryKeys.library(SECOND_DIRECTORY), {
      directory: "/old-home/Notes",
      activeNotebookID: "01M0TK829PD2067YDMZ1Y8RCBH",
      notes: [],
    } satisfies NotesLibrary)

    await invalidateNotesQueries(queryClient)

    for (const query of queryClient.getQueryCache().findAll({
      queryKey: notesQueryKeys.all(),
    })) {
      expect(query.state.isInvalidated).toBe(true)
    }
  })
})
