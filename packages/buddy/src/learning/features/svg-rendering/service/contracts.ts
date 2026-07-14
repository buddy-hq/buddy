import z from "zod"
import { CHEMISTRY_SVG_MAX_BYTES } from "@buddy/backend/chemistry/limits"

const SVG_RENDER_REQUEST_VERSION = 1 as const
const SVG_RENDER_REQUEST_EVENT_TYPE = "svg.render_request" as const
const SVG_RENDER_REQUEST_ID_PREFIX = "svg_render" as const
const SVG_RENDER_REQUEST_TIMEOUT_MS = 45_000
const SVG_RENDER_MAX_PENDING_REQUESTS_PER_DIRECTORY = 32
const SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL = 128
const SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS = 5 * 60_000
const SVG_RENDER_TERMINAL_TOMBSTONE_LIMIT = 512
const SVG_RENDER_TERMINAL_TOMBSTONE_TOTAL_LIMIT = 2_048
const SVG_RENDER_MAX_SOURCE_BYTES = 1_000_000
const SVG_REPORTED_FENCE_MAX_OVERHEAD_BYTES = 4_096
const SVG_REPORTED_FENCE_MAX_BYTES =
  SVG_RENDER_MAX_SOURCE_BYTES + SVG_REPORTED_FENCE_MAX_OVERHEAD_BYTES
const SVG_RENDER_MAX_WARNINGS = 16
const SVG_RENDER_MAX_WARNING_CHARACTERS = 1_000
const SVG_RENDER_MAX_ERROR_CHARACTERS = 2_000
const SVG_SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/u

const BROWSER_SVG_SOURCE_FORMATS = [
  "smiles",
  "cxsmiles",
  "reaction-smiles",
  "ket",
] as const

const SVG_SOURCE_FORMATS = [...BROWSER_SVG_SOURCE_FORMATS, "chemfig"] as const

const BrowserSvgSourceFormatSchema = z.enum(BROWSER_SVG_SOURCE_FORMATS)
const SvgSourceFormatSchema = z.enum(SVG_SOURCE_FORMATS)
const SvgSourceHashSchema = z.string().regex(SVG_SOURCE_HASH_PATTERN)
const SvgTextSourceSchema = z
  .string()
  .min(1, "SVG source is required.")
  .refine((source) => source.trim().length > 0, "SVG source is required.")
  .refine(
    (source) => Buffer.byteLength(source, "utf8") <= SVG_RENDER_MAX_SOURCE_BYTES,
    `SVG source exceeds the ${SVG_RENDER_MAX_SOURCE_BYTES}-byte limit.`,
  )

const BrowserSvgRenderRequestSchema = z
  .object({
    version: z.literal(SVG_RENDER_REQUEST_VERSION),
    requestID: z.string().min(1),
    directory: z.string().min(1),
    sourceHash: SvgSourceHashSchema,
    format: BrowserSvgSourceFormatSchema,
    source: SvgTextSourceSchema,
    expiresAt: z.number().int().positive(),
  })
  .strict()

const BrowserSvgRenderCompletionSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("rendered"),
      sourceHash: SvgSourceHashSchema,
      svg: z
        .string()
        .min(1)
        .refine(
          (svg) => Buffer.byteLength(svg, "utf8") <= CHEMISTRY_SVG_MAX_BYTES,
          `Rendered SVG exceeds the ${CHEMISTRY_SVG_MAX_BYTES}-byte limit.`,
        ),
      warnings: z
        .array(z.string().trim().min(1).max(SVG_RENDER_MAX_WARNING_CHARACTERS))
        .max(SVG_RENDER_MAX_WARNINGS),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("failed"),
      sourceHash: SvgSourceHashSchema,
      error: z.string().trim().min(1).max(SVG_RENDER_MAX_ERROR_CHARACTERS),
    })
    .strict(),
])

const BrowserSvgRenderCompletionResponseSchema = z
  .object({
    status: z.enum(["completed", "already_completed", "expired", "conflict"]),
  })
  .strict()

type BrowserSvgSourceFormat = z.infer<typeof BrowserSvgSourceFormatSchema>
type SvgSourceFormat = z.infer<typeof SvgSourceFormatSchema>
type BrowserSvgRenderRequest = z.infer<typeof BrowserSvgRenderRequestSchema>
type BrowserSvgRenderCompletion = z.infer<typeof BrowserSvgRenderCompletionSchema>
type BrowserSvgRenderCompletionResponse = z.infer<
  typeof BrowserSvgRenderCompletionResponseSchema
>

function isBrowserSvgSourceFormat(
  format: SvgSourceFormat,
): format is BrowserSvgSourceFormat {
  return format !== "chemfig"
}

export {
  BROWSER_SVG_SOURCE_FORMATS,
  BrowserSvgRenderCompletionResponseSchema,
  BrowserSvgRenderCompletionSchema,
  BrowserSvgRenderRequestSchema,
  BrowserSvgSourceFormatSchema,
  SVG_RENDER_MAX_ERROR_CHARACTERS,
  SVG_RENDER_MAX_PENDING_REQUESTS_PER_DIRECTORY,
  SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL,
  SVG_RENDER_MAX_SOURCE_BYTES,
  SVG_REPORTED_FENCE_MAX_BYTES,
  SVG_RENDER_MAX_WARNING_CHARACTERS,
  SVG_RENDER_MAX_WARNINGS,
  SVG_RENDER_REQUEST_EVENT_TYPE,
  SVG_RENDER_REQUEST_ID_PREFIX,
  SVG_RENDER_REQUEST_TIMEOUT_MS,
  SVG_RENDER_REQUEST_VERSION,
  SVG_RENDER_TERMINAL_TOMBSTONE_LIMIT,
  SVG_RENDER_TERMINAL_TOMBSTONE_TOTAL_LIMIT,
  SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS,
  SVG_SOURCE_FORMATS,
  SVG_SOURCE_HASH_PATTERN,
  SvgSourceFormatSchema,
  SvgSourceHashSchema,
  SvgTextSourceSchema,
  isBrowserSvgSourceFormat,
}

export type {
  BrowserSvgRenderCompletion,
  BrowserSvgRenderCompletionResponse,
  BrowserSvgRenderRequest,
  BrowserSvgSourceFormat,
  SvgSourceFormat,
}
