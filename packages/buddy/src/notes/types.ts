import type { BuddyNoteMetadata } from "./note-file"

export const BUDDY_NOTE_TYPES = ["buddy-note", "buddy-session-note"] as const

export type BuddyNoteType = (typeof BUDDY_NOTE_TYPES)[number]

/** Raster image media types accepted by note capture endpoints. */
export const NOTE_CAPTURE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const

/** Maximum number of images accepted by one note capture request. */
export const NOTE_CAPTURE_MAX_IMAGES = 10

/** Maximum decoded size of one captured note image. */
export const NOTE_CAPTURE_MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** Maximum base64 payload length corresponding to one captured note image. */
export const NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS =
  Math.ceil(NOTE_CAPTURE_MAX_IMAGE_BYTES / 3) * 4

/** Maximum filename length retained as captured-image alt text. */
export const NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS = 255

/** Media type accepted for a captured note image. */
export type NoteCaptureImageMime = (typeof NOTE_CAPTURE_IMAGE_MIME_TYPES)[number]

/** Base64 image payload supplied to a note capture operation. */
export type NoteCaptureImage = {
  filename: string
  mime: NoteCaptureImageMime
  /** Base64-encoded image bytes. */
  data: string
}

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
  preview?: string
  updatedAt: number
}

export type NoteDocument = {
  note: NoteSummary
  content: string
  version: string
  /** Resolved through the notebook registry, including notebooks that are closed. */
  sourceDirectory?: string
  /** Frontmatter of a stamped note, which `content` omits. */
  properties?: BuddyNoteMetadata
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
