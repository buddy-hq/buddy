import z from "zod"
import { BuddyObjectIDSchema, nonEmptyString } from "../../../../objects"

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u
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

const MERMAID_RENDERER_NAME = "mermaid" as const
const MERMAID_RENDER_CONFIG_VERSION = 3
const MAX_MERMAID_AUTO_REPAIR_ATTEMPTS = 1
const MERMAID_AUTO_REPAIR_TIMEOUT_MS = 120_000
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const MERMAID_RENDER_CONCURRENCY = 1
const MERMAID_STREAM_STABLE_DELAY_MS = 600
const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_mermaid_auto_repair_" as const

const MermaidSourceHashSchema = z.string().regex(SHA256_HEX_PATTERN)
const MermaidPreflightRepairCodeSchema = z.enum(MERMAID_PRELIGHT_REPAIR_CODES)

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
    failedRenderKey: MermaidSourceHashSchema,
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("succeeded"),
    replacementRevisionID: BuddyObjectIDSchema,
  }),
  MermaidAutoRepairBaseSchema.extend({
    status: z.literal("exhausted"),
    lastErrorMessage: nonEmptyString,
  }),
])

const MermaidRenderContrastAdjustmentSchema = z.object({
  selector: nonEmptyString,
  property: z.enum(["fill", "color", "stroke"]),
  from: nonEmptyString,
  to: nonEmptyString,
  reason: nonEmptyString,
})

const MermaidRepairRequestRecordSchema = z.object({
  repairRequestID: nonEmptyString,
  objectID: BuddyObjectIDSchema,
  revisionID: BuddyObjectIDSchema,
  failedRenderKey: MermaidSourceHashSchema,
  sessionID: nonEmptyString,
  status: z.enum(["running", "succeeded", "exhausted"]),
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
  expiresAt: nonEmptyString,
  replacementRevisionID: BuddyObjectIDSchema.optional(),
  lastErrorMessage: nonEmptyString.optional(),
})

type MermaidAutoRepairState = z.infer<typeof MermaidAutoRepairStateSchema>
type MermaidPreflightRepairCode = z.infer<typeof MermaidPreflightRepairCodeSchema>
type MermaidPreflightRepair = z.infer<typeof MermaidPreflightRepairSchema>
type MermaidRenderContrastAdjustment = z.infer<typeof MermaidRenderContrastAdjustmentSchema>
type MermaidRepairRequestRecord = z.infer<typeof MermaidRepairRequestRecordSchema>

export {
  MAX_MERMAID_AUTO_REPAIR_ATTEMPTS,
  MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS,
  MERMAID_AUTO_REPAIR_TIMEOUT_MS,
  MERMAID_RENDER_CONCURRENCY,
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_NAME,
  MERMAID_STREAM_STABLE_DELAY_MS,
  MermaidAutoRepairStateSchema,
  MermaidPreflightRepairCodeSchema,
  MermaidPreflightRepairSchema,
  MermaidRenderContrastAdjustmentSchema,
  MermaidRepairRequestRecordSchema,
  MermaidSourceHashSchema,
  SHA256_HEX_PATTERN,
}

export type {
  MermaidAutoRepairState,
  MermaidPreflightRepair,
  MermaidPreflightRepairCode,
  MermaidRenderContrastAdjustment,
  MermaidRepairRequestRecord,
}
