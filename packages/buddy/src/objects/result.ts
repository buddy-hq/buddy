import z from "zod"
import { BuddyObjectIDSchema } from "./kinds"
import {
  BuddyObjectLifecycleSchema,
  BuddyObjectRefSchema,
  BuddyObjectStatusSchema,
  nonEmptyString,
} from "./manifest"
import { BuddyInlineViewDataSchema } from "./view-data"

const BenchAutoOpenPolicyIDSchema = z.enum(["whiteboard", "fullscreen-html-widget"])

const BuddyPresentationDescriptorSchema = z
  .object({
    ref: BuddyObjectRefSchema,
    viewID: nonEmptyString,
    surface: z.enum(["inline", "bench", "library"]),
    data: BuddyInlineViewDataSchema.nullable(),
    autoOpen: z
      .object({
        policyID: BenchAutoOpenPolicyIDSchema,
        eventKey: nonEmptyString,
      })
      .strict()
      .nullable(),
  })
  .strict()

const BuddyObjectSummaryBaseSchema = z
  .object({
    kind: BuddyObjectRefSchema.shape.kind,
    objectID: BuddyObjectIDSchema,
    title: nonEmptyString,
    status: BuddyObjectStatusSchema,
    lifecycle: BuddyObjectLifecycleSchema,
    sourceRoot: nonEmptyString.nullable(),
  })
  .strict()

const BuddyObjectResultSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["ok", "blocked", "error"]),
    reason: nonEmptyString.nullable(),
    message: nonEmptyString,
    primaryRef: BuddyObjectRefSchema.nullable(),
    objects: z.array(BuddyObjectSummaryBaseSchema),
    presentations: z.array(BuddyPresentationDescriptorSchema),
  })
  .strict()

type BenchAutoOpenPolicyID = z.infer<typeof BenchAutoOpenPolicyIDSchema>
type BuddyPresentationDescriptor = z.infer<typeof BuddyPresentationDescriptorSchema>
type BuddyObjectSummaryBase = z.infer<typeof BuddyObjectSummaryBaseSchema>
type BuddyObjectResult = z.infer<typeof BuddyObjectResultSchema>
type BuddyObjectToolMetadata = {
  buddyObjectResult: BuddyObjectResult
} & Record<string, unknown>

function objectSummaryBaseFromManifest(input: {
  kind: BuddyObjectSummaryBase["kind"]
  objectID: string
  title: string
  status: BuddyObjectSummaryBase["status"]
  lifecycle: BuddyObjectSummaryBase["lifecycle"]
  sourceRoot: string | null
}): BuddyObjectSummaryBase {
  return BuddyObjectSummaryBaseSchema.parse(input)
}

function formatBuddyObjectRefLines(
  ref: BuddyObjectResult["primaryRef"],
): string[] {
  if (!ref) return []
  return [`object_kind=${ref.kind}`, `object_id=${ref.objectID}`]
}

export {
  BenchAutoOpenPolicyIDSchema,
  BuddyObjectResultSchema,
  BuddyObjectSummaryBaseSchema,
  BuddyPresentationDescriptorSchema,
  formatBuddyObjectRefLines,
  objectSummaryBaseFromManifest,
}
export type {
  BenchAutoOpenPolicyID,
  BuddyObjectResult,
  BuddyObjectSummaryBase,
  BuddyObjectToolMetadata,
  BuddyPresentationDescriptor,
}
