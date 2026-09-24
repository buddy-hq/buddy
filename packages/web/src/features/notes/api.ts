import type {
  NotesAnnotateMessageResponses,
  NotesCaptureData,
  NotesCaptureResponses,
  NotesCreateResponses,
  NotesListResponses,
  NotesLocationResponses,
  NotesReadResponses,
  NotesRenameResponses,
  NotesSessionNoteResponses,
  NotesUpdateResponses,
} from "@buddy/sdk"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { ProjectExplorerFileVersionConflictError } from "@/state/chat-actions"

export type NotesLibrary = NotesListResponses[200]
export type NoteSummary = NotesLibrary["notes"][number]
export type NoteDocument = NotesReadResponses[200]
export type SessionNoteCapture = NotesCaptureResponses[200]
export type SessionNoteLookup = NotesSessionNoteResponses[200]
export type NoteCaptureImage = NonNullable<NonNullable<NotesCaptureData["body"]>["images"]>[number]

export async function listNotes(directory: string, query = "", signal?: AbortSignal) {
  return requireBuddyData<NotesLibrary>(
    await getBuddyClient(directory).notes.list({ query }, signal ? { signal } : undefined),
  )
}

export async function createNote(input: { directory: string; title?: string }) {
  return requireBuddyData<NotesCreateResponses[200]>(
    await getBuddyClient(input.directory).notes.create(
      input.title ? { title: input.title } : undefined,
    ),
  )
}

export async function readNoteDocument(input: { path: string; id?: string }) {
  return requireBuddyData<NoteDocument>(
    await getBuddyClient().notes.read({ path: input.path, id: input.id }),
  )
}

export async function readSessionNote(sessionID: string) {
  return requireBuddyData<SessionNoteLookup>(
    await getBuddyClient().notes.sessionNote({ sessionID }),
  )
}

export async function readNoteLocation(input: { path: string; id?: string }) {
  return requireBuddyData<NotesLocationResponses[200]>(
    await getBuddyClient().notes.location({ path: input.path, id: input.id }),
  )
}

export async function readNoteDocumentStatus(input: { path: string; id?: string }) {
  const response = await getBuddyClient().notes.read({ path: input.path, id: input.id })
  if (response.response?.status === 404) {
    return { exists: false, version: null }
  }
  const document = requireBuddyData<NoteDocument>(response)
  return { exists: true, version: document.version }
}

export async function saveNoteContent(input: {
  path: string
  id?: string
  content: string
  expectedVersion?: string | null
}) {
  const response = await getBuddyClient().notes.update({
    path: input.path,
    id: input.id,
    content: input.content,
    expectedVersion: input.expectedVersion,
  })
  if (response.response?.status === 409) {
    throw new ProjectExplorerFileVersionConflictError(buddyResultMessage(response))
  }
  return requireBuddyData<NotesUpdateResponses[200]>(response)
}

export async function renameNote(input: {
  path: string
  id?: string
  title: string
  expectedVersion?: string | null
}) {
  const response = await getBuddyClient().notes.rename({
    path: input.path,
    id: input.id,
    title: input.title,
    expectedVersion: input.expectedVersion,
  })
  if (response.response?.status === 409) {
    throw new ProjectExplorerFileVersionConflictError(buddyResultMessage(response))
  }
  const note = requireBuddyData<NotesRenameResponses[200]>(response)
  const document = await readNoteDocument({
    path: note.relativePath,
    id: note.id,
  })
  return { note, document }
}

export async function captureComposerNote(input: {
  directory: string
  sessionID: string
  text: string
  images?: NoteCaptureImage[]
}) {
  return requireBuddyData<SessionNoteCapture>(
    await getBuddyClient(input.directory).notes.capture({
      sessionID: input.sessionID,
      text: input.text,
      images: input.images,
    }),
  )
}

export async function annotateChatMessage(input: {
  directory: string
  sessionID: string
  messageID: string
  text: string
  images?: NoteCaptureImage[]
}) {
  return requireBuddyData<NotesAnnotateMessageResponses[200]>(
    await getBuddyClient(input.directory).notes.annotateMessage({
      sessionID: input.sessionID,
      messageID: input.messageID,
      text: input.text,
      images: input.images,
    }),
  )
}
