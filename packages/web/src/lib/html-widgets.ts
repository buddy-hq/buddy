import type { HtmlWidgetReadResponse } from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "./buddy-client"

export type HtmlWidgetArtifact = HtmlWidgetReadResponse
export type HtmlWidgetViewport = HtmlWidgetArtifact["summary"]["viewport"]
export type HtmlWidgetViewportPreset = HtmlWidgetViewport["preset"]
export type HtmlWidgetWarning = HtmlWidgetArtifact["summary"]["warnings"][number]
export type HtmlWidgetToolOutput = {
  artifactID: string
  kind: "html-widget"
  title: string
  description?: string
  viewport: HtmlWidgetViewport
  runtimeUrl: string
  sourceUrl: string
  sourceHash: string
  sourcePath?: string
  warnings: HtmlWidgetWarning[]
}

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

  const artifactID = readNonEmptyString(value.artifactID)
  const kind = value.kind === "html-widget" ? "html-widget" : undefined
  const title = readNonEmptyString(value.title)
  const description = readNonEmptyString(value.description)
  const viewport = readHtmlWidgetViewport(value.viewport)
  const runtimeUrl = readNonEmptyString(value.runtimeUrl)
  const sourceUrl = readNonEmptyString(value.sourceUrl)
  const sourceHash = readNonEmptyString(value.sourceHash)
  const sourcePath = readNonEmptyString(value.sourcePath)
  const warnings = readHtmlWidgetWarnings(value.warnings)

  if (!artifactID || !kind || !title || !viewport || !runtimeUrl || !sourceUrl || !sourceHash) {
    return undefined
  }
  if (!warnings) {
    return undefined
  }

  return {
    artifactID,
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

export function htmlWidgetOutputFromArtifact(input: {
  directory: string
  artifact: HtmlWidgetArtifact
}): HtmlWidgetToolOutput {
  const artifactID = input.artifact.artifactID
  const directoryParam = encodeURIComponent(input.directory)
  const encodedArtifactID = encodeURIComponent(artifactID)

  return {
    artifactID,
    kind: "html-widget",
    title: input.artifact.title,
    ...(input.artifact.description ? { description: input.artifact.description } : {}),
    viewport: input.artifact.summary.viewport,
    runtimeUrl: `/api/artifacts/html-widget/${encodedArtifactID}/runtime?directory=${directoryParam}`,
    sourceUrl: `/api/artifacts/html-widget/${encodedArtifactID}/source?directory=${directoryParam}`,
    sourceHash: input.artifact.sourceHash,
    ...(input.artifact.summary.sourcePath
      ? { sourcePath: input.artifact.summary.sourcePath }
      : {}),
    warnings: input.artifact.summary.warnings,
  }
}

export async function readHtmlWidgetSource(input: {
  directory: string
  artifactID: string
}): Promise<string> {
  const response = requireBuddyData(
    await getBuddyClient(input.directory).htmlWidget.source({
      directory: input.directory,
      artifactID: input.artifactID,
    }),
  )
  return response.source
}
