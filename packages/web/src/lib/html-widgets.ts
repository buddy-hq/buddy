import { getBuddyClient, requireBuddyData } from "./buddy-client"

const HTML_WIDGET_VIEWPORTS = {
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
} as const

type HtmlWidgetViewportPreset = keyof typeof HTML_WIDGET_VIEWPORTS

/**
 * Box to reserve for a widget whose descriptor has not hydrated yet, so its
 * preset is not known. Reserving the wrong aspect leaves a bounded correction;
 * reserving nothing leaves a ~480px jump when the frame replaces a status row.
 */
export const HTML_WIDGET_FALLBACK_VIEWPORT_PRESET: HtmlWidgetViewportPreset = "standard_16_10"

export type HtmlWidgetViewport = (typeof HTML_WIDGET_VIEWPORTS)[HtmlWidgetViewportPreset] & {
  preset: HtmlWidgetViewportPreset
}

export type HtmlWidgetPresentation = {
  objectID: string
  kind: "html-widget"
  title: string
  sourceRoot: string
  entryPath: string
  sourceVersion: string | null
  viewport: HtmlWidgetViewport
  runtimeUrl: string
}

function isHtmlWidgetViewportPreset(value: string): value is HtmlWidgetViewportPreset {
  return value in HTML_WIDGET_VIEWPORTS
}

export function resolveHtmlWidgetViewport(preset: HtmlWidgetViewportPreset): HtmlWidgetViewport
export function resolveHtmlWidgetViewport(preset: string): HtmlWidgetViewport | undefined
export function resolveHtmlWidgetViewport(preset: string): HtmlWidgetViewport | undefined {
  if (!isHtmlWidgetViewportPreset(preset)) return undefined
  return {
    preset,
    ...HTML_WIDGET_VIEWPORTS[preset],
  }
}

export function formatHtmlWidgetViewport(viewport: HtmlWidgetViewport): string {
  return `${viewport.label} · ${viewport.width}x${viewport.height}`
}

export async function readHtmlWidgetSource(input: {
  directory: string
  objectID: string
}): Promise<string> {
  const response = requireBuddyData(
    await getBuddyClient(input.directory).objectHtmlWidget.source({
      directory: input.directory,
      objectID: input.objectID,
    }),
  )
  return response.source
}
