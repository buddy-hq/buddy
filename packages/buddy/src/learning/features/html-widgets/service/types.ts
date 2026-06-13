import z from "zod"
import {
  ARTIFACT_KINDS,
  ArtifactIDSchema,
  ArtifactManifestBaseSchema,
  ArtifactToolOriginSchema,
  SourceHashSchema,
  nonEmptyString,
} from "../../../../artifacts"

export const HTML_WIDGET_KIND = ARTIFACT_KINDS.htmlWidget
export const MAX_HTML_WIDGET_SOURCE_BYTES = 1_000_000 as const
export const DEFAULT_HTML_WIDGET_VIEWPORT_PRESET = "standard_16_10" as const
export const HTML_WIDGET_RUNTIME_CSP = [
  "default-src 'none'",
  "sandbox allow-scripts",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "media-src data: blob:",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ")

export const HTML_WIDGET_VIEWPORT_PRESET_VALUES = [
  "compact_4_3",
  "standard_16_10",
  "wide_16_9",
  "square",
  "tall_mobile",
] as const

export type HtmlWidgetViewportPreset = (typeof HTML_WIDGET_VIEWPORT_PRESET_VALUES)[number]

export const HTML_WIDGET_VIEWPORT_PRESETS: Record<
  HtmlWidgetViewportPreset,
  {
    width: number
    height: number
    label: string
  }
> = {
  compact_4_3: {
    width: 640,
    height: 480,
    label: "Compact 4:3",
  },
  standard_16_10: {
    width: 960,
    height: 600,
    label: "Standard 16:10",
  },
  wide_16_9: {
    width: 1280,
    height: 720,
    label: "Wide 16:9",
  },
  square: {
    width: 720,
    height: 720,
    label: "Square",
  },
  tall_mobile: {
    width: 390,
    height: 844,
    label: "Tall mobile",
  },
}

export const HtmlWidgetViewportPresetSchema = z.enum(HTML_WIDGET_VIEWPORT_PRESET_VALUES)

export const HtmlWidgetViewportSchema = z.object({
  preset: HtmlWidgetViewportPresetSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: nonEmptyString,
})

export const HtmlWidgetWarningSchema = z.object({
  code: z.enum(["relative_asset_reference", "blocked_remote_reference"]),
  message: z.string().min(1),
})

export const HtmlWidgetSummarySchema = z.object({
  viewport: HtmlWidgetViewportSchema,
  sourcePath: z.string().min(1).optional(),
  warnings: z.array(HtmlWidgetWarningSchema),
})

export const HtmlWidgetArtifactManifestSchema = ArtifactManifestBaseSchema.extend({
  kind: z.literal(HTML_WIDGET_KIND),
  sourceHash: SourceHashSchema,
  origin: ArtifactToolOriginSchema,
  summary: HtmlWidgetSummarySchema,
})

export const HtmlWidgetSourceResponseSchema = z.object({
  artifactID: ArtifactIDSchema,
  source: z.string(),
})

export const PresentHtmlWidgetOutputSchema = z.object({
  artifactID: ArtifactIDSchema,
  kind: z.literal(HTML_WIDGET_KIND),
  title: nonEmptyString,
  description: nonEmptyString.optional(),
  viewport: HtmlWidgetViewportSchema,
  runtimeUrl: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceHash: SourceHashSchema,
  sourcePath: z.string().min(1).optional(),
  warnings: z.array(HtmlWidgetWarningSchema),
})

export type HtmlWidgetArtifactManifest = z.infer<typeof HtmlWidgetArtifactManifestSchema>
export type HtmlWidgetManifest = HtmlWidgetArtifactManifest
export type HtmlWidgetSummary = z.infer<typeof HtmlWidgetSummarySchema>
export type HtmlWidgetViewport = z.infer<typeof HtmlWidgetViewportSchema>
export type HtmlWidgetWarning = z.infer<typeof HtmlWidgetWarningSchema>
export type PresentHtmlWidgetOutput = z.infer<typeof PresentHtmlWidgetOutputSchema>
