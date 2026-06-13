import z from "zod"

const ARTIFACT_KIND_VALUES = [
  "mermaid",
  "question-set",
  "flashcard-deck",
  "media-presentation",
  "html-widget",
  "figure",
  "freeform-figure",
] as const

const ARTIFACT_MANIFEST_VERSION = 1 as const
const ARTIFACT_MANIFEST_FILE_NAME = "manifest.json" as const
const ARTIFACTS_DIRECTORY_NAME = "artifacts" as const
const ARTIFACT_SYSTEM_DIRECTORY_NAME = "_system" as const
const BUDDY_DIRECTORY_NAME = ".buddy" as const
const ARTIFACT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u

const ArtifactKindSchema = z.enum(ARTIFACT_KIND_VALUES)
const ArtifactIDSchema = z.string().regex(ARTIFACT_ID_PATTERN)
const SourceHashSchema = z.string().regex(SHA256_HEX_PATTERN)

type ArtifactKind = z.infer<typeof ArtifactKindSchema>
type ArtifactID = z.infer<typeof ArtifactIDSchema>

const ARTIFACT_KINDS = {
  mermaid: "mermaid",
  questionSet: "question-set",
  flashcardDeck: "flashcard-deck",
  mediaPresentation: "media-presentation",
  htmlWidget: "html-widget",
  figure: "figure",
  freeformFigure: "freeform-figure",
} satisfies Record<string, ArtifactKind>

export {
  ARTIFACT_ID_PATTERN,
  ARTIFACT_KINDS,
  ARTIFACT_KIND_VALUES,
  ARTIFACT_MANIFEST_FILE_NAME,
  ARTIFACT_MANIFEST_VERSION,
  ARTIFACT_SYSTEM_DIRECTORY_NAME,
  ARTIFACTS_DIRECTORY_NAME,
  ArtifactIDSchema,
  ArtifactKindSchema,
  BUDDY_DIRECTORY_NAME,
  SHA256_HEX_PATTERN,
  SourceHashSchema,
}

export type { ArtifactID, ArtifactKind }
