import z from "zod"

const nonEmptyString = z.string().trim().min(1)
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u)

const RenderMermaidInputSchema = z.object({
  kind: z.literal("mermaid.v1"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
})

const RenderMermaidOutputSchema = z.object({
  artifactID: sha256Hex,
  kind: z.literal("mermaid.v1"),
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
  kind: z.literal("mermaid.v1"),
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

type RenderMermaidInput = z.infer<typeof RenderMermaidInputSchema>
type RenderMermaidOutput = z.infer<typeof RenderMermaidOutputSchema>
type MermaidArtifactManifest = z.infer<typeof MermaidArtifactManifestSchema>

export { MermaidArtifactManifestSchema, RenderMermaidInputSchema, RenderMermaidOutputSchema }

export type { MermaidArtifactManifest, RenderMermaidInput, RenderMermaidOutput }
