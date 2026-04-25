import z from "zod"

const nonEmptyString = z.string().trim().min(1)
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u)
const MERMAID_ARTIFACT_KIND = "mermaid.v1" as const
const MermaidArtifactKindSchema = z.literal(MERMAID_ARTIFACT_KIND)

const RenderMermaidOutputSchema = z.object({
  artifactID: sha256Hex,
  kind: MermaidArtifactKindSchema,
  mime: z.literal("application/vnd.mermaid"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  diagramType: nonEmptyString,
  repairAttempts: z.number().int().nonnegative().max(3),
  repairLog: z.array(nonEmptyString),
  source: nonEmptyString,
  artifactUrl: nonEmptyString,
  markdown: nonEmptyString,
})

const MermaidArtifactManifestSchema = z.object({
  version: z.literal(1),
  artifactID: sha256Hex,
  kind: MermaidArtifactKindSchema,
  diagramType: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  repairAttempts: z.number().int().nonnegative().max(3),
  repairLog: z.array(nonEmptyString),
  sourceHash: sha256Hex,
  createdAt: nonEmptyString,
  createdBy: z.object({
    sessionID: nonEmptyString,
    messageID: nonEmptyString,
    callID: nonEmptyString,
  }),
})

type RenderMermaidOutput = z.infer<typeof RenderMermaidOutputSchema>
type MermaidArtifactManifest = z.infer<typeof MermaidArtifactManifestSchema>

export { MERMAID_ARTIFACT_KIND, MermaidArtifactManifestSchema, RenderMermaidOutputSchema }

export type { MermaidArtifactManifest, RenderMermaidOutput }
