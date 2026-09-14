import type {
  NotesAnnotateMessageResponses,
  NotesCaptureData,
  NotesCaptureResponses,
  NotesCreateResponses,
  NotesListResponses,
  NotesReadResponses,
  NotesRenameResponses,
  NotesUpdateResponses,
} from "@buddy/sdk"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { ProjectExplorerFileVersionConflictError } from "@/state/chat-actions"

export type NotesLibrary = NotesListResponses[200]
export type NoteSummary = NotesLibrary["notes"][number]
export type NoteDocument = NotesReadResponses[200]
export type SessionNoteCapture = NotesCaptureResponses[200]
export type NoteCaptureImage = NonNullable<NonNullable<NotesCaptureData["body"]>["images"]>[number]

export async function listNotes(directory: string) {
  return requireBuddyData<NotesLibrary>(await getBuddyClient(directory).notes.list())
}

export async function createNote(input: { directory: string; title?: string }) {
  return requireBuddyData<NotesCreateResponses[200]>(
    await getBuddyClient(input.directory).notes.create(
      input.title ? { title: input.title } : undefined,
    ),
  )
}

export async function readNoteDocument(input: { path: string }) {
  return requireBuddyData<NoteDocument>(await getBuddyClient().notes.read({ path: input.path }))
}

export async function readNoteDocumentStatus(input: { path: string }) {
  const response = await getBuddyClient().notes.read({ path: input.path })
  if (response.response?.status === 404) {
    return { exists: false, version: null }
  }
  const document = requireBuddyData<NoteDocument>(response)
  return { exists: true, version: document.version }
}

export async function saveNoteContent(input: {
  path: string
  content: string
  expectedVersion?: string | null
}) {
  const response = await getBuddyClient().notes.update({
    path: input.path,
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
  title: string
  expectedVersion?: string | null
}) {
  const response = await getBuddyClient().notes.rename({
    path: input.path,
    title: input.title,
    expectedVersion: input.expectedVersion,
  })
  if (response.response?.status === 409) {
    throw new ProjectExplorerFileVersionConflictError(buddyResultMessage(response))
  }
  const note = requireBuddyData<NotesRenameResponses[200]>(response)
  const document = await readNoteDocument({
    path: note.relativePath,
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
