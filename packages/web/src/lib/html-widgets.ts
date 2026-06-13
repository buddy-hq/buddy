import type {
  HtmlWidgetArtifactsListResponse,
  HtmlWidgetArtifactsReadResponse,
} from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "./buddy-client"

export type HtmlWidgetArtifact = HtmlWidgetArtifactsReadResponse
export type HtmlWidgetToolOutput = Pick<
  HtmlWidgetArtifact,
  | "widgetID"
  | "kind"
  | "title"
  | "description"
  | "viewport"
  | "runtimeUrl"
  | "sourceUrl"
  | "sourceHash"
  | "sourcePath"
  | "warnings"
>
export type HtmlWidgetViewport = HtmlWidgetArtifact["viewport"]
export type HtmlWidgetViewportPreset = HtmlWidgetViewport["preset"]
export type HtmlWidgetWarning = HtmlWidgetArtifact["warnings"][number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function isHtmlWidgetViewportPreset(value: string): value is HtmlWidgetViewportPreset {
  switch (value) {
    case "compact_4_3":
    case "standard_16_10":
    case "wide_16_9":
    case "square":
    case "tall_mobile":
      return true
    default:
      return false
  }
}

function readHtmlWidgetViewport(value: unknown): HtmlWidgetViewport | undefined {
  if (!isRecord(value)) return undefined

  const preset = readNonEmptyString(value.preset)
  const width = readPositiveInteger(value.width)
  const height = readPositiveInteger(value.height)
  const label = readNonEmptyString(value.label)

  if (!preset || !isHtmlWidgetViewportPreset(preset) || !width || !height || !label) {
    return undefined
  }

  return {
    preset,
    width,
    height,
    label,
  }
}

function readHtmlWidgetWarning(value: unknown): HtmlWidgetWarning | undefined {
  if (!isRecord(value)) return undefined

  const code =
    value.code === "relative_asset_reference" || value.code === "blocked_remote_reference"
      ? value.code
      : undefined
  const message = readNonEmptyString(value.message)

  if (!code || !message) return undefined

  return {
    code,
    message,
  }
}

function readHtmlWidgetWarnings(value: unknown): HtmlWidgetWarning[] | undefined {
  if (!Array.isArray(value)) return undefined

  const warnings: HtmlWidgetWarning[] = []
  for (const entry of value) {
    const warning = readHtmlWidgetWarning(entry)
    if (!warning) return undefined
    warnings.push(warning)
  }

  return warnings
}

export function readHtmlWidgetOutputValue(value: unknown): HtmlWidgetToolOutput | undefined {
  if (!isRecord(value)) return undefined

  const widgetID = readNonEmptyString(value.widgetID)
  const kind = value.kind === "html.widget.v1" ? "html.widget.v1" : undefined
  const title = readNonEmptyString(value.title)
  const description = readNonEmptyString(value.description)
  const viewport = readHtmlWidgetViewport(value.viewport)
  const runtimeUrl = readNonEmptyString(value.runtimeUrl)
  const sourceUrl = readNonEmptyString(value.sourceUrl)
  const sourceHash = readNonEmptyString(value.sourceHash)
  const sourcePath = readNonEmptyString(value.sourcePath)
  const warnings = readHtmlWidgetWarnings(value.warnings)

  if (!widgetID || !kind || !title || !viewport || !runtimeUrl || !sourceUrl || !sourceHash) {
    return undefined
  }
  if (!warnings) {
    return undefined
  }

  return {
    widgetID,
    kind,
    title,
    ...(description ? { description } : {}),
    viewport,
    runtimeUrl,
    sourceUrl,
    sourceHash,
    ...(sourcePath ? { sourcePath } : {}),
    warnings,
  }
}

export function readHtmlWidgetOutputArtifact(
  metadata: Record<string, unknown>,
): HtmlWidgetToolOutput | undefined {
  return readNonEmptyString(metadata.artifact) === "PresentHtmlWidgetOutput"
    ? readHtmlWidgetOutputValue(metadata.value)
    : undefined
}

export function formatHtmlWidgetViewport(viewport: HtmlWidgetViewport): string {
  return `${viewport.label} · ${viewport.width}x${viewport.height}`
}

export async function loadWorkspaceHtmlWidgets(
  directory: string,
): Promise<HtmlWidgetArtifactsListResponse> {
  return requireBuddyData(
    await getBuddyClient(directory).htmlWidgetArtifacts.list({
      directory,
    }),
  )
}

export async function readHtmlWidgetSource(input: {
  directory: string
  widgetID: string
}): Promise<string> {
  const response = requireBuddyData(
    await getBuddyClient(input.directory).htmlWidgetArtifacts.source({
      directory: input.directory,
      widgetID: input.widgetID,
    }),
  )
  return response.source
}
