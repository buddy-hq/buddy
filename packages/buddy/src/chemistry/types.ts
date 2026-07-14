import z from "zod"

const CHEMISTRY_RENDERER_NAMES = {
  chemfig: "node-tikzjax",
} as const

const CHEMFIG_RENDERER_VERSION = "1.0.5" as const
const CHEMFIG_RENDER_CONFIG_VERSION = 1 as const
const CHEMFIG_MAX_SOURCE_BYTES = 64 * 1024
const CHEMFIG_MAX_REQUEST_BODY_BYTES = CHEMFIG_MAX_SOURCE_BYTES * 6 + 1024
const CHEMISTRY_HASH_PATTERN = /^[a-f0-9]{64}$/u
const CHEMFIG_CHILD_FAILURE_STAGES = {
  runtimeInitialization: "runtime_initialization",
  texCompilation: "tex_compilation",
  dviConversion: "dvi_conversion",
} as const

const ChemistrySourceSchema = z
  .string()
  .min(1, "Chemistry source is required.")
  .refine((source) => source.trim().length > 0, "Chemistry source is required.")

const ChemistrySourceHashSchema = z.string().regex(CHEMISTRY_HASH_PATTERN)

const ChemistryRenderErrorCodeSchema = z.enum([
  "invalid_source",
  "source_too_large",
  "unsafe_source",
  "renderer_busy",
  "chemfig_runtime_unavailable",
  "chemfig_render_timeout",
  "chemfig_render_failed",
  "chemfig_tex_compile_failed",
  "chemfig_dvi_conversion_failed",
  "chemfig_output_too_large",
  "chemfig_invalid_svg",
])

type ChemistryRenderErrorCode = z.infer<typeof ChemistryRenderErrorCodeSchema>
type ChemfigChildFailureStage =
  (typeof CHEMFIG_CHILD_FAILURE_STAGES)[keyof typeof CHEMFIG_CHILD_FAILURE_STAGES]

export {
  CHEMFIG_RENDER_CONFIG_VERSION,
  CHEMFIG_MAX_REQUEST_BODY_BYTES,
  CHEMFIG_MAX_SOURCE_BYTES,
  CHEMFIG_RENDERER_VERSION,
  CHEMFIG_CHILD_FAILURE_STAGES,
  CHEMISTRY_HASH_PATTERN,
  CHEMISTRY_RENDERER_NAMES,
  ChemistryRenderErrorCodeSchema,
  ChemistrySourceHashSchema,
  ChemistrySourceSchema,
}
export type { ChemfigChildFailureStage, ChemistryRenderErrorCode }
