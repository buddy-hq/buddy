import z from "zod"
import {
  ARTIFACT_KINDS,
  ArtifactIDSchema,
  ArtifactManifestBaseSchema,
  SourceHashSchema,
  nonEmptyString,
} from "../../../../artifacts"

const RenderFreeformFigureOutputSchema = z.object({
  artifactID: ArtifactIDSchema,
  mime: z.literal("image/svg+xml"),
  url: nonEmptyString,
  relativePath: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  markdown: nonEmptyString,
  repairAttempts: z.literal(0),
})

const FreeformFigureSummarySchema = z.object({
  mime: z.literal("image/svg+xml"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  repairAttempts: z.literal(0),
})

const FreeformFigureArtifactManifestSchema = ArtifactManifestBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.freeformFigure),
  sourceHash: SourceHashSchema,
  summary: FreeformFigureSummarySchema,
})

type RenderFreeformFigureOutput = z.infer<typeof RenderFreeformFigureOutputSchema>
type FreeformFigureArtifactManifest = z.infer<typeof FreeformFigureArtifactManifestSchema>
type FreeformFigureSummary = z.infer<typeof FreeformFigureSummarySchema>

export {
  FreeformFigureArtifactManifestSchema,
  FreeformFigureSummarySchema,
  RenderFreeformFigureOutputSchema,
}

export type { FreeformFigureArtifactManifest, FreeformFigureSummary, RenderFreeformFigureOutput }
