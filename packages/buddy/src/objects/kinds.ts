import z from "zod"

const BUDDY_DIRECTORY_NAME = ".buddy" as const
const OBJECTS_DIRECTORY_NAME = "objects" as const
const OBJECTS_VERSION_DIRECTORY_NAME = "v1" as const
const OBJECT_INDEX_DIRECTORY_NAME = "_index" as const
const OBJECT_INDEX_FILE_NAME = "objects.json" as const
const OBJECT_MANIFEST_FILE_NAME = "object.json" as const
const OBJECT_TOMBSTONE_FILE_NAME = "tombstone.json" as const
const OBJECT_SOURCE_DIRECTORY_NAME = "source" as const
const OBJECT_REVISIONS_DIRECTORY_NAME = "revisions" as const
const OBJECT_DERIVED_DIRECTORY_NAME = "derived" as const
const OBJECT_STATE_DIRECTORY_NAME = "state" as const
const OBJECT_MANIFEST_VERSION = 1 as const
const OBJECT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u

const BUDDY_OBJECT_KIND_VALUES = [
  "resource",
  "whiteboard",
  "html-widget",
  "mermaid",
  "figure",
  "freeform-figure",
  "media-presentation",
  "question-set",
  "flashcard-deck",
] as const

const BuddyObjectKindSchema = z.enum(BUDDY_OBJECT_KIND_VALUES)
const BuddyObjectIDSchema = z.string().regex(OBJECT_ID_PATTERN)

type BuddyObjectKind = z.infer<typeof BuddyObjectKindSchema>
type BuddyObjectID = z.infer<typeof BuddyObjectIDSchema>

const BUDDY_OBJECT_KINDS = {
  resource: "resource",
  whiteboard: "whiteboard",
  htmlWidget: "html-widget",
  mermaid: "mermaid",
  figure: "figure",
  freeformFigure: "freeform-figure",
  mediaPresentation: "media-presentation",
  questionSet: "question-set",
  flashcardDeck: "flashcard-deck",
} satisfies Record<string, BuddyObjectKind>

export {
  BUDDY_DIRECTORY_NAME,
  BUDDY_OBJECT_KIND_VALUES,
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectKindSchema,
  OBJECTS_DIRECTORY_NAME,
  OBJECTS_VERSION_DIRECTORY_NAME,
  OBJECT_DERIVED_DIRECTORY_NAME,
  OBJECT_ID_PATTERN,
  OBJECT_INDEX_DIRECTORY_NAME,
  OBJECT_INDEX_FILE_NAME,
  OBJECT_MANIFEST_FILE_NAME,
  OBJECT_MANIFEST_VERSION,
  OBJECT_REVISIONS_DIRECTORY_NAME,
  OBJECT_SOURCE_DIRECTORY_NAME,
  OBJECT_STATE_DIRECTORY_NAME,
  OBJECT_TOMBSTONE_FILE_NAME,
}
export type { BuddyObjectID, BuddyObjectKind }
