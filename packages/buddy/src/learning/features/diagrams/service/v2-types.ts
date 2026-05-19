import z from "zod"

const nonEmptyString = z.string().trim().min(1)
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u)

const MERMAID_PRELIGHT_REPAIR_CODES = [
  "stripped_fence",
  "trimmed_wrapping_prose",
  "removed_duplicate_mermaid_marker",
  "normalized_smart_punctuation",
  "normalized_unicode_arrow",
  "canonicalized_header",
  "quoted_er_relationship_label",
  "converted_flowchart_single_quoted_label",
  "renamed_subgraph_node_collision",
  "normalized_timeline_period",
  "removed_trailing_xychart_connector",
] as const

const MERMAID_ARTIFACT_KIND = "mermaid.v2" as const
const MERMAID_RENDERER_NAME = "mermaid" as const
const MERMAID_RENDER_CONFIG_VERSION = 3
const MAX_MERMAID_AUTO_REPAIR_ATTEMPTS = 1
const MERMAID_AUTO_REPAIR_TIMEOUT_MS = 120_000
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const MERMAID_RENDER_CONCURRENCY = 1
const MERMAID_STREAM_STABLE_DELAY_MS = 600
const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_mermaid_auto_repair_" as const

const MermaidArtifactKindSchema = z.literal(MERMAID_ARTIFACT_KIND)
const MermaidPreflightRepairCodeSchema = z.enum(MERMAID_PRELIGHT_REPAIR_CODES)

const MermaidToolArtifactOriginSchema = z.object({
  kind: z.literal("tool"),
  sessionID: nonEmptyString,
  messageID: nonEmptyString,
  callID: nonEmptyString,
})

const MermaidMarkdownArtifactOriginSchema = z.object({
  kind: z.literal("markdown"),
  sessionID: nonEmptyString,
  messageID: nonEmptyString,
  partID: nonEmptyString,
  segmentIndex: z.number().int().nonnegative(),
})

const MermaidArtifactOriginSchema = z.discriminatedUnion("kind", [
  MermaidToolArtifactOriginSchema,
  MermaidMarkdownArtifactOriginSchema,
])

const MermaidPreflightRepairSchema = z.object({
  code: MermaidPreflightRepairCodeSchema,
  message: nonEmptyString,
})

const MermaidAutoRepairBaseSchema = z.object({
  attempts: z.number().int().nonnegative().max(MAX_MERMAID_AUTO_REPAIR_ATTEMPTS),
})

const MermaidAutoRepairStateSchema = z.discriminatedUnion("status", [
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("not_needed"),
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("eligible"),
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("running"),
    repairRequestID: nonEmptyString,
    failedRenderKey: sha256Hex,
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("succeeded"),
    replacementArtifactID: sha256Hex,
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("exhausted"),
    lastErrorMessage: nonEmptyString,
  }),
])

const MermaidArtifactManifestSchema = z.object({
  version: z.literal(2),
  artifactID: sha256Hex,
  kind: MermaidArtifactKindSchema,
  origin: MermaidArtifactOriginSchema,
  diagramType: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  sourceHash: sha256Hex,
  preflightRepairs: z.array(MermaidPreflightRepairSchema),
  autoRepair: MermaidAutoRepairStateSchema,
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
  supersedesArtifactID: sha256Hex.optional(),
})

const MermaidRenderContrastAdjustmentSchema = z.object({
  selector: nonEmptyString,
  property: z.enum(["fill", "color", "stroke"]),
  from: nonEmptyString,
  to: nonEmptyString,
  reason: nonEmptyString,
})

const MermaidRenderRecordBaseSchema = z.object({
  renderKey: sha256Hex,
  artifactID: sha256Hex,
  sourceHash: sha256Hex,
  rendererName: z.literal(MERMAID_RENDERER_NAME),
  rendererVersion: nonEmptyString,
  renderConfigVersion: z.number().int().nonnegative(),
  themeSignature: nonEmptyString,
  renderedAt: nonEmptyString,
})

const MermaidRenderedRecordSchema = MermaidRenderRecordBaseSchema.extend({
  status: z.literal("rendered"),
  svg: nonEmptyString,
  contrastAdjustments: z.array(MermaidRenderContrastAdjustmentSchema),
})

const MermaidFailedRenderRecordSchema = MermaidRenderRecordBaseSchema.extend({
  status: z.literal("failed"),
  errorMessage: nonEmptyString,
})

const MermaidRenderRecordSchema = z.discriminatedUnion("status", [
  MermaidRenderedRecordSchema,
  MermaidFailedRenderRecordSchema,
])

const MermaidResolvedRenderRecordSchema = z.object({
  renderKey: sha256Hex,
  render: MermaidRenderRecordSchema.optional(),
})

const MermaidArtifactReadSchema = MermaidArtifactManifestSchema.extend({
  source: nonEmptyString,
  render: MermaidRenderRecordSchema.optional(),
})

const RenderMermaidOutputSchema = z.object({
  artifactID: sha256Hex,
  kind: MermaidArtifactKindSchema,
  mime: z.literal("application/vnd.buddy.mermaid"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  diagramType: nonEmptyString,
  source: nonEmptyString,
  sourceHash: sha256Hex,
  preflightRepairs: z.array(MermaidPreflightRepairSchema),
  artifactUrl: nonEmptyString,
  filesystemPath: nonEmptyString,
  supersedesArtifactID: sha256Hex.optional(),
})

const MermaidRepairRequestRecordSchema = z.object({
  repairRequestID: nonEmptyString,
  artifactID: sha256Hex,
  failedRenderKey: sha256Hex,
  sessionID: nonEmptyString,
  status: z.enum(["running", "succeeded", "exhausted"]),
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
  expiresAt: nonEmptyString,
  replacementArtifactID: sha256Hex.optional(),
  lastErrorMessage: nonEmptyString.optional(),
})

type MermaidArtifactOrigin = z.infer<typeof MermaidArtifactOriginSchema>
type MermaidPreflightRepairCode = z.infer<typeof MermaidPreflightRepairCodeSchema>
type MermaidPreflightRepair = z.infer<typeof MermaidPreflightRepairSchema>
type MermaidAutoRepairState = z.infer<typeof MermaidAutoRepairStateSchema>
type MermaidArtifactManifest = z.infer<typeof MermaidArtifactManifestSchema>
type MermaidRenderContrastAdjustment = z.infer<typeof MermaidRenderContrastAdjustmentSchema>
type MermaidRenderRecord = z.infer<typeof MermaidRenderRecordSchema>
type MermaidResolvedRenderRecord = z.infer<typeof MermaidResolvedRenderRecordSchema>
type MermaidArtifactReadResult = z.infer<typeof MermaidArtifactReadSchema>
type RenderMermaidOutput = z.infer<typeof RenderMermaidOutputSchema>
type MermaidRepairRequestRecord = z.infer<typeof MermaidRepairRequestRecordSchema>

export {
  MAX_MERMAID_AUTO_REPAIR_ATTEMPTS,
  MERMAID_ARTIFACT_KIND,
  MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS,
  MERMAID_AUTO_REPAIR_TIMEOUT_MS,
  MERMAID_RENDER_CONCURRENCY,
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_NAME,
  MERMAID_STREAM_STABLE_DELAY_MS,
  MermaidArtifactKindSchema,
  MermaidArtifactManifestSchema,
  MermaidArtifactOriginSchema,
  MermaidArtifactReadSchema,
  MermaidAutoRepairStateSchema,
  MermaidMarkdownArtifactOriginSchema,
  MermaidPreflightRepairCodeSchema,
  MermaidPreflightRepairSchema,
  MermaidRenderContrastAdjustmentSchema,
  MermaidRenderRecordSchema,
  MermaidRepairRequestRecordSchema,
  MermaidResolvedRenderRecordSchema,
  MermaidToolArtifactOriginSchema,
  RenderMermaidOutputSchema,
}

export type {
  MermaidArtifactManifest,
  MermaidArtifactOrigin,
  MermaidArtifactReadResult,
  MermaidAutoRepairState,
  MermaidPreflightRepair,
  MermaidPreflightRepairCode,
  MermaidRenderContrastAdjustment,
  MermaidRenderRecord,
  MermaidRepairRequestRecord,
  MermaidResolvedRenderRecord,
  RenderMermaidOutput,
}
