import crypto from "node:crypto"
import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import {
  PresentedMediaValidationError,
  resolvePresentedMediaPathInfo,
} from "../../media-presentations/service/file-media"
import { HtmlWidgetNotFoundError, HtmlWidgetValidationError } from "../errors"
import { buildHtmlWidgetID, HtmlWidgetPath } from "./path"
import {
  HTML_WIDGET_KIND,
  HTML_WIDGET_MANIFEST_VERSION,
  HTML_WIDGET_VIEWPORT_PRESETS,
  DEFAULT_HTML_WIDGET_VIEWPORT_PRESET,
  MAX_HTML_WIDGET_SOURCE_BYTES,
  HtmlWidgetManifestSchema,
  type HtmlWidgetManifest,
  type HtmlWidgetRead,
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

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function buildHtmlWidgetRuntimeUrl(input: { directory: string; widgetID: string }): string {
  return `/api/html-widget-artifacts/${encodeURIComponent(input.widgetID)}/runtime?directory=${encodeURIComponent(input.directory)}`
}

function buildHtmlWidgetSourceUrl(input: { directory: string; widgetID: string }): string {
  return `/api/html-widget-artifacts/${encodeURIComponent(input.widgetID)}/source?directory=${encodeURIComponent(input.directory)}`
}

function toHtmlWidgetRead(directory: string, manifest: HtmlWidgetManifest): HtmlWidgetRead {
  return {
    ...manifest,
    runtimeUrl: buildHtmlWidgetRuntimeUrl({ directory, widgetID: manifest.widgetID }),
    sourceUrl: buildHtmlWidgetSourceUrl({ directory, widgetID: manifest.widgetID }),
  }
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
    sourceHash: sha256(source),
    warnings: collectHtmlWidgetWarnings(source),
  }
}

async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
  )
  await fs.writeFile(tempPath, content, "utf8")
  await fs.rename(tempPath, filePath)
}

async function writeHtmlWidgetArtifact(input: {
  directory: string
  manifest: HtmlWidgetManifest
  source: string
}): Promise<void> {
  const artifactDirectory = HtmlWidgetPath.artifactDirectory(input.directory, input.manifest.widgetID)
  await fs.mkdir(artifactDirectory, { recursive: true })
  await writeTextFileAtomic(
    HtmlWidgetPath.sourceFile(input.directory, input.manifest.widgetID),
    input.source,
  )
  await writeTextFileAtomic(
    HtmlWidgetPath.manifestFile(input.directory, input.manifest.widgetID),
    `${JSON.stringify(input.manifest, null, 2)}\n`,
  )
}

export async function createHtmlWidgetArtifact(
  input: CreateHtmlWidgetInput,
): Promise<HtmlWidgetRead> {
  const resolved = await resolveHtmlWidgetSource({ directory: input.directory, path: input.path })
  const widgetID = buildHtmlWidgetID()
  const now = new Date().toISOString()
  const manifest = HtmlWidgetManifestSchema.parse({
    version: HTML_WIDGET_MANIFEST_VERSION,
    widgetID,
    kind: HTML_WIDGET_KIND,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    viewport: buildHtmlWidgetViewport(input.viewportPreset),
    sourceHash: resolved.sourceHash,
    sourcePath: resolved.workspacePath ?? resolved.displayPath,
    origin: input.origin,
    warnings: resolved.warnings,
    createdAt: now,
    updatedAt: now,
  })

  await writeHtmlWidgetArtifact({
    directory: input.directory,
    manifest,
    source: resolved.source,
  })

  return toHtmlWidgetRead(input.directory, manifest)
}

export async function readHtmlWidgetManifest(
  directory: string,
  widgetID: string,
): Promise<HtmlWidgetManifest> {
  try {
    const text = await fs.readFile(HtmlWidgetPath.manifestFile(directory, widgetID), "utf8")
    return HtmlWidgetManifestSchema.parse(JSON.parse(text))
  } catch {
    throw new HtmlWidgetNotFoundError(widgetID)
  }
}

export async function readHtmlWidgetArtifact(
  directory: string,
  widgetID: string,
): Promise<HtmlWidgetRead> {
  return toHtmlWidgetRead(directory, await readHtmlWidgetManifest(directory, widgetID))
}

export async function readHtmlWidgetSource(
  directory: string,
  widgetID: string,
): Promise<string> {
  try {
    return await fs.readFile(HtmlWidgetPath.sourceFile(directory, widgetID), "utf8")
  } catch {
    throw new HtmlWidgetNotFoundError(widgetID)
  }
}

async function readManifestEntry(
  directory: string,
  entry: Dirent,
): Promise<HtmlWidgetManifest | undefined> {
  if (!entry.isDirectory()) return undefined
  try {
    return await readHtmlWidgetManifest(directory, entry.name)
  } catch {
    return undefined
  }
}

export async function listHtmlWidgetArtifacts(directory: string): Promise<HtmlWidgetRead[]> {
  const entries = await fs
    .readdir(HtmlWidgetPath.artifactRoot(directory), { withFileTypes: true })
    .catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return []
      }
      throw error
    })

  const manifests = await Promise.all(
    entries.map((entry) => readManifestEntry(directory, entry)),
  )

  return manifests
    .filter((manifest): manifest is HtmlWidgetManifest => manifest !== undefined)
    .map((manifest) => toHtmlWidgetRead(directory, manifest))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}
