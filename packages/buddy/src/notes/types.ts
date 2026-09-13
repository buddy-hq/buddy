export const BUDDY_NOTE_TYPES = ["buddy-note", "buddy-session-note"] as const

export type BuddyNoteType = (typeof BUDDY_NOTE_TYPES)[number]

export type NoteSummary = {
  kind: "plain" | "buddy"
  title: string
  relativePath: string
  id?: string
  type?: BuddyNoteType
  notebookID?: string
  notebook?: string
  notebookAvailable?: boolean
  sessionID?: string
  updatedAt: number
}

export type NoteDocument = {
  note: NoteSummary
  content: string
  version: string
}

export type NotesLibraryView = {
  directory: string
  activeNotebookID?: string
  notes: NoteSummary[]
}

export type SessionNoteCaptureResult = {
  note: NoteSummary
  /** True when this capture created the session note rather than appending to it. */
  created: boolean
}
