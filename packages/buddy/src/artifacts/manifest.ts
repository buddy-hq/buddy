import z from "zod"
import {
  ARTIFACT_MANIFEST_VERSION,
  ArtifactIDSchema,
  ArtifactKindSchema,
  SourceHashSchema,
} from "./kinds"

const nonEmptyString = z.string().trim().min(1)
const timestampString = z.string().datetime()

const ArtifactToolOriginSchema = z.object({
  kind: z.literal("tool"),
  sessionID: nonEmptyString,
  messageID: nonEmptyString,
  callID: nonEmptyString,
  subagent: nonEmptyString.optional(),
})

const ArtifactMarkdownOriginSchema = z.object({
  kind: z.literal("markdown"),
  sessionID: nonEmptyString,
  messageID: nonEmptyString,
  partID: nonEmptyString,
  segmentIndex: z.number().int().nonnegative(),
})

const ArtifactOriginSchema = z.discriminatedUnion("kind", [
  ArtifactToolOriginSchema,
  ArtifactMarkdownOriginSchema,
])

const ArtifactManifestBaseSchema = z.object({
  version: z.literal(ARTIFACT_MANIFEST_VERSION),
  artifactID: ArtifactIDSchema,
  kind: ArtifactKindSchema,
  title: nonEmptyString,
  description: nonEmptyString.optional(),
  origin: ArtifactOriginSchema.optional(),
  createdAt: timestampString,
  updatedAt: timestampString,
  sourceHash: SourceHashSchema.optional(),
  summary: z.unknown(),
})

type ArtifactManifestBase = z.infer<typeof ArtifactManifestBaseSchema>
type ArtifactOrigin = z.infer<typeof ArtifactOriginSchema>
type ArtifactToolOrigin = z.infer<typeof ArtifactToolOriginSchema>
type ArtifactMarkdownOrigin = z.infer<typeof ArtifactMarkdownOriginSchema>

export {
  ArtifactManifestBaseSchema,
  ArtifactMarkdownOriginSchema,
  ArtifactOriginSchema,
  ArtifactToolOriginSchema,
  nonEmptyString,
  timestampString,
}
export type {
  ArtifactManifestBase,
  ArtifactMarkdownOrigin,
  ArtifactOrigin,
  ArtifactToolOrigin,
}
