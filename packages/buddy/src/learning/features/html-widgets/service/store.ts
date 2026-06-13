import fs from "node:fs/promises"
import path from "node:path"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ARTIFACT_MANIFEST_VERSION,
  generateArtifactID,
  readArtifactManifest,
  readArtifactTextFile,
  sha256Text,
  writeArtifactRecord,
} from "../../../../artifacts"
import {
  PresentedMediaValidationError,
  resolvePresentedMediaPathInfo,
} from "../../media-presentations/service/file-media"
import {
  HTML_WIDGET_KIND,
  HTML_WIDGET_VIEWPORT_PRESETS,
  DEFAULT_HTML_WIDGET_VIEWPORT_PRESET,
  MAX_HTML_WIDGET_SOURCE_BYTES,
  HtmlWidgetArtifactManifestSchema,
  type HtmlWidgetManifest,
  type HtmlWidgetViewport,
  type HtmlWidgetViewportPreset,
  type HtmlWidgetWarning,
} from "./types"

const HTML_FILE_EXTENSIONS = new Set([".html", ".htm"])
const HTML_ATTRIBUTE_REFERENCE_PATTERN =
  /\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/giu
const HTML_SCRIPT_OR_STYLE_REFERENCE_PATTERN =
  /<(?:script|link)\b[^>]*\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/giu
const HTML_REMOTE_REFERENCE_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu
const HTML_FETCH_REFERENCE_PATTERN =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(\s*(?:"([^"]*)"|'([^']*)')/giu
const HTML_REFERENCE_WARNING_LIMIT = 8

type CreateHtmlWidgetInput = {
  directory: string
  path: string
  title: string
  description?: string
  viewportPreset?: HtmlWidgetViewportPreset
  origin: {
    kind: "tool"
    sessionID: string
    messageID: string
    callID: string
  }
}

type ResolvedHtmlWidgetSource = {
  displayPath: string
  workspacePath: string | null
  source: string
  sourceHash: string
  warnings: HtmlWidgetWarning[]
}

export class HtmlWidgetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HtmlWidgetValidationError"
  }
}

export function buildHtmlWidgetRuntimeUrl(input: { directory: string; artifactID: string }): string {
  return `/api/artifacts/html-widget/${encodeURIComponent(input.artifactID)}/runtime?directory=${encodeURIComponent(input.directory)}`
}

export function buildHtmlWidgetSourceUrl(input: { directory: string; artifactID: string }): string {
  return `/api/artifacts/html-widget/${encodeURIComponent(input.artifactID)}/source?directory=${encodeURIComponent(input.directory)}`
}

function buildHtmlWidgetViewport(
  viewportPreset: HtmlWidgetViewportPreset | undefined,
): HtmlWidgetViewport {
  const preset = viewportPreset ?? DEFAULT_HTML_WIDGET_VIEWPORT_PRESET
  return {
    preset,
    ...HTML_WIDGET_VIEWPORT_PRESETS[preset],
  }
}

function isProbablyRelativeReference(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("#")) return false
  if (trimmed.startsWith("/")) return false
  if (trimmed.startsWith("//")) return false
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed)) return false
  return true
}

function isRemoteReference(value: string): boolean {
  return HTML_REMOTE_REFERENCE_PATTERN.test(value.trim())
}

function addWarning(
  warnings: HtmlWidgetWarning[],
  warning: HtmlWidgetWarning,
  seenMessages: Set<string>,
): void {
  if (warnings.length >= HTML_REFERENCE_WARNING_LIMIT) return
  if (seenMessages.has(warning.message)) return
  seenMessages.add(warning.message)
  warnings.push(warning)
}

function captureReference(match: RegExpExecArray): string | undefined {
  return match[1] ?? match[2] ?? match[3]
}

function collectHtmlWidgetWarnings(source: string): HtmlWidgetWarning[] {
  const warnings: HtmlWidgetWarning[] = []
  const seenMessages = new Set<string>()

  for (const match of source.matchAll(HTML_ATTRIBUTE_REFERENCE_PATTERN)) {
    const reference = captureReference(match)
    if (!reference) continue
    if (isProbablyRelativeReference(reference)) {
      addWarning(
        warnings,
        {
          code: "relative_asset_reference",
          message: `Relative asset reference '${reference}' will not be copied into the widget snapshot.`,
        },
        seenMessages,
      )
    }
    if (isRemoteReference(reference)) {
      addWarning(
        warnings,
        {
          code: "blocked_remote_reference",
          message: `Remote reference '${reference}' will be blocked by the widget runtime policy.`,
        },
        seenMessages,
      )
    }
  }

  for (const match of source.matchAll(HTML_SCRIPT_OR_STYLE_REFERENCE_PATTERN)) {
    const reference = captureReference(match)
    if (!reference || !isRemoteReference(reference)) continue
    addWarning(
      warnings,
      {
        code: "blocked_remote_reference",
        message: `Remote script or stylesheet '${reference}' will be blocked by the widget runtime policy.`,
      },
      seenMessages,
    )
  }

  for (const match of source.matchAll(HTML_FETCH_REFERENCE_PATTERN)) {
    const reference = match[1] ?? match[2]
    if (!reference) continue
    addWarning(
      warnings,
      {
        code: "blocked_remote_reference",
        message: `Network request '${reference}' will be blocked by the widget runtime policy.`,
      },
      seenMessages,
    )
  }

  return warnings
}

function validateHtmlExtension(filePath: string): void {
  const extension = path.extname(filePath).toLowerCase()
  if (!HTML_FILE_EXTENSIONS.has(extension)) {
    throw new HtmlWidgetValidationError("HTML widget source must be a .html or .htm file.")
  }
}

function decodeUtf8(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    throw new HtmlWidgetValidationError("HTML widget source must be valid UTF-8 text.")
  }
}

async function resolveHtmlWidgetSource(input: {
  directory: string
  path: string
}): Promise<ResolvedHtmlWidgetSource> {
  const pathInfo = await resolvePresentedMediaPathInfo({
    directory: input.directory,
    path: input.path,
  }).catch((error: unknown) => {
    if (error instanceof PresentedMediaValidationError) {
      throw new HtmlWidgetValidationError(error.message)
    }
    throw error
  })

  validateHtmlExtension(pathInfo.absolutePath)

  const stats = await fs.stat(pathInfo.absolutePath)
  if (!stats.isFile()) {
    throw new HtmlWidgetValidationError("HTML widget source must be a local file.")
  }
  if (stats.size === 0) {
    throw new HtmlWidgetValidationError("HTML widget source must not be empty.")
  }
  if (stats.size > MAX_HTML_WIDGET_SOURCE_BYTES) {
    throw new HtmlWidgetValidationError(
      `HTML widget source is too large. Maximum allowed size is ${MAX_HTML_WIDGET_SOURCE_BYTES} bytes.`,
    )
  }

  const source = decodeUtf8(await fs.readFile(pathInfo.absolutePath))
  if (source.trim().length === 0) {
    throw new HtmlWidgetValidationError("HTML widget source must not be blank.")
  }

  return {
    displayPath: pathInfo.displayPath,
    workspacePath: pathInfo.workspacePath,
    source,
    sourceHash: sha256Text(source),
    warnings: collectHtmlWidgetWarnings(source),
  }
}

async function writeHtmlWidgetArtifact(input: {
  directory: string
  manifest: HtmlWidgetManifest
  source: string
}): Promise<void> {
  await writeArtifactRecord({
    directory: input.directory,
    kind: ARTIFACT_KINDS.htmlWidget,
    artifactID: input.manifest.artifactID,
    manifest: input.manifest,
    files: [
      {
        relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
        format: "text",
        content: input.source,
      },
    ],
  })
}

export async function createHtmlWidgetArtifact(
  input: CreateHtmlWidgetInput,
): Promise<HtmlWidgetManifest> {
  const resolved = await resolveHtmlWidgetSource({ directory: input.directory, path: input.path })
  const artifactID = generateArtifactID()
  const now = new Date().toISOString()
  const manifest = HtmlWidgetArtifactManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID,
    kind: HTML_WIDGET_KIND,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    sourceHash: resolved.sourceHash,
    origin: input.origin,
    createdAt: now,
    updatedAt: now,
    summary: {
      viewport: buildHtmlWidgetViewport(input.viewportPreset),
      sourcePath: resolved.workspacePath ?? resolved.displayPath,
      warnings: resolved.warnings,
    },
  })

  await writeHtmlWidgetArtifact({
    directory: input.directory,
    manifest,
    source: resolved.source,
  })

  return manifest
}

export async function readHtmlWidgetManifest(
  directory: string,
  artifactID: string,
): Promise<HtmlWidgetManifest> {
  return readArtifactManifest({
    directory,
    kind: ARTIFACT_KINDS.htmlWidget,
    artifactID,
    schema: HtmlWidgetArtifactManifestSchema,
  })
}

export async function readHtmlWidgetSource(
  directory: string,
  artifactID: string,
): Promise<string> {
  return readArtifactTextFile({
    directory,
    kind: ARTIFACT_KINDS.htmlWidget,
    artifactID,
    relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
  })
}
