import z from "zod"

const nonEmptyString = z.string().trim().min(1)

export const MAX_HTML_WIDGET_SOURCE_BYTES = 1_000_000 as const
export const DEFAULT_HTML_WIDGET_VIEWPORT_PRESET = "standard_16_10" as const
export const HTML_WIDGET_RUNTIME_CSP = [
  "default-src 'none'",
  "sandbox allow-scripts",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
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

export const HTML_WIDGET_VIEWPORT_PRESETS = {
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
} satisfies Record<
  HtmlWidgetViewportPreset,
  {
    width: number
    height: number
    label: string
  }
>

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

export type HtmlWidgetViewport = z.infer<typeof HtmlWidgetViewportSchema>
export type HtmlWidgetWarning = z.infer<typeof HtmlWidgetWarningSchema>
