import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  HtmlWidgetObjectSummarySchema,
  OBJECT_MANIFEST_FILE_NAME,
  OBJECT_SOURCE_DIRECTORY_NAME,
  generateObjectID,
  listObjects,
  readObjectManifest,
  registerBuddyObjectKind,
  upsertObjectIndexRecord,
  type BuddyObjectManifest,
  type BuddyObjectSourceRef,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import { mimeTypeForPath } from "../../../../http/mime"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  MAX_HTML_WIDGET_SOURCE_BYTES,
  type HtmlWidgetViewportPreset,
  type HtmlWidgetWarning,
} from "./types"

const HTML_FILE_EXTENSIONS = new Set([".html", ".htm"])
const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime" as const
const HTML_ATTRIBUTE_REFERENCE_PATTERN =
  /\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/giu
const HTML_SCRIPT_OR_STYLE_REFERENCE_PATTERN =
  /<(?:script|link)\b[^>]*\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/giu
const HTML_REMOTE_REFERENCE_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu
const HTML_FETCH_REFERENCE_PATTERN =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(\s*(?:"([^"]*)"|'([^']*)')/giu
const HTML_REFERENCE_WARNING_LIMIT = 8
const HTML_WIDGET_SOURCE_VERSION_FILE_LIMIT = 512
const HTML_WIDGET_SOURCE_VERSION_TOTAL_BYTES_LIMIT = 5_000_000
const HTML_WIDGET_SOURCE_VERSION_DEPTH_LIMIT = 16
const HTML_WIDGET_SOURCE_VERSION_IGNORE_NAMES = new Set([
  ".DS_Store",
  ".git",
  "node_modules",
  ".turbo",
  "dist",
  "build",
])
const HTML_WIDGET_SOURCE_VERSION_IGNORE_EXTENSIONS = new Set([".log"])
const HTML_WIDGET_DEFAULT_CONTENT_TYPE = "application/octet-stream" as const
const HTML_WIDGET_RUNTIME_LIVE_VERSION = "live" as const

type HtmlWidgetObjectSummary = ReturnType<typeof HtmlWidgetObjectSummarySchema.parse>

type PresentHtmlWidgetObjectInput =
  | {
      action: "present_path"
      directory: string
      path: string
      entryPath: string | null
      title: string
      description?: string
      viewportPreset: HtmlWidgetViewportPreset
      origin: {
        kind: "tool"
        sessionID: string
        messageID: string
        callID: string
      }
    }
  | {
      action: "present_object"
      directory: string
      objectID: string
    }

type PresentHtmlWidgetObjectResult = {
  manifest: BuddyObjectManifest & { summary: HtmlWidgetObjectSummary }
  sourceRoot: string
  entryPath: string
  editPath: string
  originalPath: string | null
  originalPathStatus: "moved" | "restored" | "missing" | "error" | null
  inlineData: {
    renderer: "html-widget"
    runtimeUrl: string
    sourceRoot: string
    entryPath: string
    sourceVersion: string | null
    viewportPreset: string
  }
}

type ResolvedHtmlWidgetAdoptionSource =
  | {
      kind: "file"
      workspacePath: string
      absolutePath: string
      entryPath: string
    }
  | {
      kind: "directory"
      workspacePath: string
      absolutePath: string
      entryPath: string
    }

type ResolvedHtmlWidgetWorkspacePath = {
  workspacePath: string
  requestedAbsolutePath: string
  sourceAbsolutePath: string
}

export class HtmlWidgetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HtmlWidgetValidationError"
  }
}

export class HtmlWidgetAdoptionError extends Error {
  constructor(
    message: string,
    public readonly originalPathStatus: "restored" | "missing" | "error",
  ) {
    super(message)
    this.name = "HtmlWidgetAdoptionError"
  }
}

export function buildHtmlWidgetObjectRuntimeUrl(input: {
  directory: string
  objectID: string
  entryPath: string
  version: string | null
}): string {
  const directoryToken = Buffer.from(input.directory, "utf8").toString("base64url")
  const versionToken = input.version ?? HTML_WIDGET_RUNTIME_LIVE_VERSION
  const encodedEntryPath = input.entryPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `/api/objects/html-widget/runtime/${directoryToken}/${encodeURIComponent(input.objectID)}/${versionToken}/${encodedEntryPath}`
}

export function decodeHtmlWidgetRuntimeDirectoryToken(token: string): string {
  const directory = Buffer.from(token, "base64url").toString("utf8")
  if (!directory || Buffer.from(directory, "utf8").toString("base64url") !== token) {
    throw new HtmlWidgetValidationError("Invalid HTML widget runtime directory token.")
  }
  return directory
}

export function htmlWidgetRuntimeVersionFromToken(token: string): string | null {
  return token === HTML_WIDGET_RUNTIME_LIVE_VERSION ? null : token
}

export function buildHtmlWidgetObjectSourceUrl(input: {
  directory: string
  objectID: string
  path: string | null
}): string {
  const pathParam = input.path ? `&path=${encodeURIComponent(input.path)}` : ""
  return `/api/objects/html-widget/${encodeURIComponent(input.objectID)}/source?directory=${encodeURIComponent(input.directory)}${pathParam}`
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
          message: `Relative asset reference '${reference}' must exist inside the managed widget source tree.`,
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

async function validateHtmlWidgetSourceFile(absolutePath: string): Promise<void> {
  const stats = await fs.stat(absolutePath)
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

  const source = decodeUtf8(await fs.readFile(absolutePath))
  if (source.trim().length === 0) {
    throw new HtmlWidgetValidationError("HTML widget source must not be blank.")
  }
}

export async function presentHtmlWidgetObject(
  input: PresentHtmlWidgetObjectInput,
): Promise<PresentHtmlWidgetObjectResult> {
  if (input.action === "present_object") {
    const manifest = await readHtmlWidgetObjectManifest(input.directory, input.objectID)
    return buildPresentHtmlWidgetObjectResult({
      directory: input.directory,
      manifest,
      originalPath: null,
      originalPathStatus: null,
    })
  }

  const adoptedManifest = await resolvePreviouslyAdoptedHtmlWidget({
    directory: input.directory,
    rawPath: input.path,
  })
  if (adoptedManifest) {
    return buildPresentHtmlWidgetObjectResult({
      directory: input.directory,
      manifest: adoptedManifest,
      originalPath: input.path,
      originalPathStatus: "missing",
    })
  }

  const source = await resolveWorkspaceHtmlWidgetAdoptionSource({
    directory: input.directory,
    rawPath: input.path,
    entryPath: input.entryPath,
  })
  const manifest = await adoptHtmlWidgetSource({
    input,
    source,
  })
  return buildPresentHtmlWidgetObjectResult({
    directory: input.directory,
    manifest,
    originalPath: source.workspacePath,
    originalPathStatus: "moved",
  })
}

export async function readHtmlWidgetObjectManifest(
  directory: string,
  objectID: string,
): Promise<BuddyObjectManifest & { summary: HtmlWidgetObjectSummary }> {
  const manifest = await readObjectManifest({
    directory,
    kind: BUDDY_OBJECT_KINDS.htmlWidget,
    objectID,
  })
  return BuddyObjectManifestSchema.safeExtend({
    summary: HtmlWidgetObjectSummarySchema,
  }).parse(manifest)
}

export async function readHtmlWidgetObjectSource(input: {
  directory: string
  objectID: string
  path?: string | null
}): Promise<{
  objectID: string
  path: string
  source: string
}> {
  const manifest = await readHtmlWidgetObjectManifest(input.directory, input.objectID)
  const entryPath = input.path?.trim() || manifest.summary.entryPath
  validateSafeRelativePath(entryPath, "HTML widget source path")
  const sourceRoot = BuddyObjectPath.sourceRoot(
    input.directory,
    BUDDY_OBJECT_KINDS.htmlWidget,
    input.objectID,
  )
  const sourcePath = path.join(sourceRoot, entryPath)
  await assertPathInsideRoot(sourceRoot, sourcePath)
  return {
    objectID: input.objectID,
    path: entryPath,
    source: await fs.readFile(sourcePath, "utf8"),
  }
}

export async function resolveHtmlWidgetObjectRuntimeFile(input: {
  directory: string
  objectID: string
  assetPath: string
  version?: string | null
}): Promise<{
  filePath: string
  contentType: string
  isDocument: boolean
  immutable: boolean
}> {
  await readHtmlWidgetObjectManifest(input.directory, input.objectID)
  validateSafeRelativePath(input.assetPath, "HTML widget runtime asset path")
  const sourceRoot = BuddyObjectPath.sourceRoot(
    input.directory,
    BUDDY_OBJECT_KINDS.htmlWidget,
    input.objectID,
  )
  const filePath = path.join(sourceRoot, input.assetPath)
  await assertPathInsideRoot(sourceRoot, filePath)
  const stats = await fs.stat(filePath)
  if (!stats.isFile()) {
    throw new HtmlWidgetValidationError("HTML widget runtime path must point to a file.")
  }
  const sourceVersion = await computeHtmlWidgetSourceVersion({
    directory: input.directory,
    objectID: input.objectID,
  }).catch(() => null)
  return {
    filePath,
    contentType: mimeTypeForPath(filePath, HTML_WIDGET_DEFAULT_CONTENT_TYPE),
    isDocument: HTML_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
    immutable: !!input.version && !!sourceVersion && input.version === sourceVersion,
  }
}

async function adoptHtmlWidgetSource(input: {
  input: Extract<PresentHtmlWidgetObjectInput, { action: "present_path" }>
  source: ResolvedHtmlWidgetAdoptionSource
}): Promise<BuddyObjectManifest & { summary: HtmlWidgetObjectSummary }> {
  const objectID = generateObjectID()
  const kindRoot = BuddyObjectPath.kindRoot(input.input.directory, BUDDY_OBJECT_KINDS.htmlWidget)
  const targetDirectory = BuddyObjectPath.objectDirectory(
    input.input.directory,
    BUDDY_OBJECT_KINDS.htmlWidget,
    objectID,
  )
  const stagingDirectory = path.join(kindRoot, `.object-${objectID}.${crypto.randomUUID()}.tmp`)
  const stagingSourceRoot = path.join(stagingDirectory, OBJECT_SOURCE_DIRECTORY_NAME)
  await fs.mkdir(kindRoot, { recursive: true })
  await fs.mkdir(stagingDirectory, { recursive: true })

  let sourceMoved = false
  try {
    if (input.source.kind === "file") {
      await fs.mkdir(stagingSourceRoot, { recursive: true })
      await fs.rename(
        input.source.absolutePath,
        path.join(stagingSourceRoot, path.basename(input.source.absolutePath)),
      )
    } else {
      await fs.rename(input.source.absolutePath, stagingSourceRoot)
    }
    sourceMoved = true

    const entryAbsolutePath = path.join(stagingSourceRoot, input.source.entryPath)
    const entrySource = await fs.readFile(entryAbsolutePath, "utf8")
    const sourceStat = await fs.stat(entryAbsolutePath)
    const sourceVersion = await computeHtmlWidgetSourceVersionForRoot(stagingSourceRoot).catch(
      () => null,
    )
    const now = new Date().toISOString()
    const sourceRoot = htmlWidgetSourceRootDisplayPath(objectID)
    const originalSourceRef: BuddyObjectSourceRef = {
      role: "original",
      path: input.source.workspacePath,
      displayPath: input.source.workspacePath,
      workspacePath: input.source.workspacePath,
      mutable: false,
      copied: false,
      availability: "missing",
      exists: false,
    }
    const sourceRef: BuddyObjectSourceRef = {
      role: "authoring",
      path: sourceRoot,
      displayPath: sourceRoot,
      workspacePath: sourceRoot,
      mutable: true,
      copied: false,
      availability: "available",
      exists: true,
      sizeBytes: Number(sourceStat.size),
      modifiedAt: sourceStat.mtime.toISOString(),
    }
    const manifest = BuddyObjectManifestSchema.parse({
      version: 1,
      kind: BUDDY_OBJECT_KINDS.htmlWidget,
      objectID,
      title: input.input.title,
      ...(input.input.description ? { description: input.input.description } : {}),
      status: "ready",
      lifecycle: "live",
      origin: input.input.origin,
      createdAt: now,
      updatedAt: now,
      sourceRefs: [originalSourceRef, sourceRef],
      views: buildHtmlWidgetObjectViews({
        objectID,
        entryPath: input.source.entryPath,
        viewportPreset: input.input.viewportPreset,
      }),
      summary: HtmlWidgetObjectSummarySchema.parse({
        kind: BUDDY_OBJECT_KINDS.htmlWidget,
        entryPath: input.source.entryPath,
        viewportPreset: input.input.viewportPreset,
        sourceVersion,
        warnings: collectHtmlWidgetWarnings(entrySource).map((warning) => warning.message),
      }),
    })
    await writeJsonFileAtomic(path.join(stagingDirectory, OBJECT_MANIFEST_FILE_NAME), manifest)
    await fs.rename(stagingDirectory, targetDirectory)
    await upsertObjectIndexRecord({ directory: input.input.directory, manifest }).catch(
      () => undefined,
    )
    return BuddyObjectManifestSchema.safeExtend({
      summary: HtmlWidgetObjectSummarySchema,
    }).parse(manifest)
  } catch (error) {
    if (sourceMoved) {
      const restored = await restoreAdoptedHtmlWidgetSource({
        source: input.source,
        stagingSourceRoot,
      })
      await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
      if (!restored.ok) {
        throw new HtmlWidgetAdoptionError(
          error instanceof Error ? error.message : String(error),
          restored.status,
        )
      }
    } else {
      await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  }
}

async function resolveWorkspaceHtmlWidgetAdoptionSource(input: {
  directory: string
  rawPath: string
  entryPath: string | null
}): Promise<ResolvedHtmlWidgetAdoptionSource> {
  const sourcePath = await resolveHtmlWidgetWorkspaceSourcePath({
    directory: input.directory,
    rawPath: input.rawPath,
  })
  const stats = await fs.stat(sourcePath.sourceAbsolutePath).catch(() => undefined)
  if (!stats) {
    throw new HtmlWidgetValidationError(`HTML widget source not found: ${sourcePath.workspacePath}`)
  }
  if (stats.isFile()) {
    validateHtmlExtension(sourcePath.sourceAbsolutePath)
    await validateHtmlWidgetSourceFile(sourcePath.sourceAbsolutePath)
    return {
      kind: "file",
      workspacePath: sourcePath.workspacePath,
      absolutePath: sourcePath.sourceAbsolutePath,
      entryPath: path.basename(sourcePath.sourceAbsolutePath),
    }
  }
  if (!stats.isDirectory()) {
    throw new HtmlWidgetValidationError("HTML widget source must be a file or directory.")
  }
  if (!input.entryPath) {
    throw new HtmlWidgetValidationError("entryPath is required when presenting a widget folder.")
  }
  validateSafeRelativePath(input.entryPath, "HTML widget entry path")
  validateHtmlExtension(input.entryPath)
  const entryAbsolutePath = path.join(sourcePath.sourceAbsolutePath, input.entryPath)
  const entryStats = await fs.stat(entryAbsolutePath).catch(() => undefined)
  if (!entryStats?.isFile()) {
    throw new HtmlWidgetValidationError(`HTML widget entry file not found: ${input.entryPath}`)
  }
  await validateHtmlWidgetSourceFile(entryAbsolutePath)
  return {
    kind: "directory",
    workspacePath: sourcePath.workspacePath,
    absolutePath: sourcePath.sourceAbsolutePath,
    entryPath: input.entryPath,
  }
}

async function restoreAdoptedHtmlWidgetSource(input: {
  source: ResolvedHtmlWidgetAdoptionSource
  stagingSourceRoot: string
}): Promise<{ ok: true } | { ok: false; status: "restored" | "missing" | "error" }> {
  try {
    const adoptedPath =
      input.source.kind === "file"
        ? path.join(input.stagingSourceRoot, path.basename(input.source.absolutePath))
        : input.stagingSourceRoot
    const exists = await fs.stat(adoptedPath).catch(() => undefined)
    if (!exists) return { ok: false, status: "missing" }
    await fs.rename(adoptedPath, input.source.absolutePath)
    if (input.source.kind === "file") {
      await fs.rm(input.stagingSourceRoot, { recursive: true, force: true })
    }
    return { ok: true }
  } catch {
    return { ok: false, status: "error" }
  }
}

function buildHtmlWidgetObjectViews(input: {
  objectID: string
  entryPath: string
  viewportPreset: HtmlWidgetViewportPreset
}): BuddyObjectManifest["views"] {
  const sourceRoot = htmlWidgetSourceRootDisplayPath(input.objectID)
  return [
    {
      viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
      label: "Widget",
      surfaces: ["inline", "bench", "source"],
      availability: { status: "available" },
      inline: {
        renderer: "html-widget",
        params: {
          renderer: "html-widget",
          entryPath: input.entryPath,
          viewportPreset: input.viewportPreset,
        },
      },
      bench: { resolver: "object-view" },
      source: {
        sourceRoot,
        entryPath: input.entryPath,
      },
    },
  ]
}

async function buildPresentHtmlWidgetObjectResult(input: {
  directory: string
  manifest: BuddyObjectManifest & { summary: HtmlWidgetObjectSummary }
  originalPath: string | null
  originalPathStatus: "moved" | "restored" | "missing" | "error" | null
}): Promise<PresentHtmlWidgetObjectResult> {
  const sourceVersion = await computeHtmlWidgetSourceVersion({
    directory: input.directory,
    objectID: input.manifest.objectID,
  }).catch(() => input.manifest.summary.sourceVersion)
  const sourceRoot = htmlWidgetSourceRootDisplayPath(input.manifest.objectID)
  const editPath = path.posix.join(sourceRoot, input.manifest.summary.entryPath)
  return {
    manifest: input.manifest,
    sourceRoot,
    entryPath: input.manifest.summary.entryPath,
    editPath,
    originalPath: input.originalPath,
    originalPathStatus: input.originalPathStatus,
    inlineData: {
      renderer: "html-widget",
      runtimeUrl: buildHtmlWidgetObjectRuntimeUrl({
        directory: input.directory,
        objectID: input.manifest.objectID,
        entryPath: input.manifest.summary.entryPath,
        version: sourceVersion,
      }),
      sourceRoot,
      entryPath: input.manifest.summary.entryPath,
      sourceVersion,
      viewportPreset: input.manifest.summary.viewportPreset,
    },
  }
}

function htmlWidgetSourceRootDisplayPath(objectID: string): string {
  return path.posix.join(
    BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.htmlWidget, objectID),
    OBJECT_SOURCE_DIRECTORY_NAME,
  )
}

async function computeHtmlWidgetSourceVersion(input: {
  directory: string
  objectID: string
}): Promise<string> {
  return computeHtmlWidgetSourceVersionForRoot(
    BuddyObjectPath.sourceRoot(input.directory, BUDDY_OBJECT_KINDS.htmlWidget, input.objectID),
  )
}

async function computeHtmlWidgetSourceVersionForRoot(sourceRoot: string): Promise<string> {
  const hash = crypto.createHash("sha256")
  let fileCount = 0
  let totalBytes = 0

  async function visit(currentPath: string, depth: number): Promise<void> {
    if (depth > HTML_WIDGET_SOURCE_VERSION_DEPTH_LIMIT) {
      throw new HtmlWidgetValidationError("HTML widget source tree is too deep to version.")
    }
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
      if (HTML_WIDGET_SOURCE_VERSION_IGNORE_NAMES.has(entry.name)) continue
      if (HTML_WIDGET_SOURCE_VERSION_IGNORE_EXTENSIONS.has(path.extname(entry.name))) continue
      const entryPath = path.join(currentPath, entry.name)
      const relativePath = path.relative(sourceRoot, entryPath).split(path.sep).join("/")
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      fileCount += 1
      if (fileCount > HTML_WIDGET_SOURCE_VERSION_FILE_LIMIT) {
        throw new HtmlWidgetValidationError(
          "HTML widget source tree has too many files to version.",
        )
      }
      const bytes = await fs.readFile(entryPath)
      totalBytes += bytes.byteLength
      if (totalBytes > HTML_WIDGET_SOURCE_VERSION_TOTAL_BYTES_LIMIT) {
        throw new HtmlWidgetValidationError("HTML widget source tree is too large to version.")
      }
      hash.update(relativePath)
      hash.update("\0")
      hash.update(bytes)
      hash.update("\0")
    }
  }

  await visit(sourceRoot, 0)
  return hash.digest("hex").slice(0, 26).toUpperCase()
}

function normalizeWorkspaceRelativePath(filepath: string): string | undefined {
  const input = filepath.replaceAll("\\", "/").replace(/^\.\//u, "").trim()
  const normalized = path.posix.normalize(input)
  if (
    !input ||
    input === "~" ||
    input.startsWith("~/") ||
    /^[a-z][a-z\d+.-]*:/iu.test(input) ||
    normalized !== input ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized)
  ) {
    return undefined
  }
  return normalized
}

function htmlWidgetSourcePathCandidate(input: { directory: string; rawPath: string }): string {
  const rawPath = input.rawPath.trim()
  if (!rawPath) {
    throw new HtmlWidgetValidationError("HTML widget source path must not be empty.")
  }

  const workspacePath = normalizeWorkspaceRelativePath(rawPath)
  if (workspacePath) {
    return path.resolve(input.directory, workspacePath)
  }

  if (rawPath.startsWith("file://")) {
    try {
      return fileURLToPath(rawPath)
    } catch {
      throw new HtmlWidgetValidationError("HTML widget file URL could not be resolved.")
    }
  }

  if (rawPath === "~") {
    return os.homedir()
  }

  if (rawPath.startsWith("~/") || rawPath.startsWith("~\\")) {
    return path.join(os.homedir(), rawPath.slice(2))
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath
  }

  throw new HtmlWidgetValidationError(
    "HTML widget source path must be workspace-relative, absolute, file://, or ~/ and resolve inside the current workspace.",
  )
}

async function resolveHtmlWidgetWorkspaceSourcePath(input: {
  directory: string
  rawPath: string
}): Promise<ResolvedHtmlWidgetWorkspacePath> {
  const workspaceInputRoot = path.resolve(input.directory)
  const workspaceRoot = await fs
    .realpath(input.directory)
    .catch(() => path.resolve(input.directory))
  const requestedAbsolutePath = path.resolve(
    htmlWidgetSourcePathCandidate({
      directory: workspaceInputRoot,
      rawPath: input.rawPath,
    }),
  )
  if (
    !isPathInsideRoot(workspaceInputRoot, requestedAbsolutePath) &&
    !isPathInsideRoot(workspaceRoot, requestedAbsolutePath)
  ) {
    throw new HtmlWidgetValidationError("HTML widget source must be inside the workspace.")
  }

  const sourceAbsolutePath = await fs
    .realpath(requestedAbsolutePath)
    .catch(() => requestedAbsolutePath)
  if (
    !isPathInsideRoot(workspaceRoot, sourceAbsolutePath) &&
    !isPathInsideRoot(workspaceInputRoot, sourceAbsolutePath)
  ) {
    throw new HtmlWidgetValidationError("HTML widget source must be inside the workspace.")
  }

  const relativeBase = isPathInsideRoot(workspaceInputRoot, requestedAbsolutePath)
    ? workspaceInputRoot
    : workspaceRoot
  const relativePath = path.relative(relativeBase, requestedAbsolutePath).split(path.sep).join("/")
  const workspacePath = normalizeWorkspaceRelativePath(relativePath)
  if (!workspacePath) {
    throw new HtmlWidgetValidationError(
      "HTML widget source path must resolve to a file or folder inside the current workspace.",
    )
  }

  return {
    workspacePath,
    requestedAbsolutePath,
    sourceAbsolutePath,
  }
}

async function resolvePreviouslyAdoptedHtmlWidget(input: {
  directory: string
  rawPath: string
}): Promise<(BuddyObjectManifest & { summary: HtmlWidgetObjectSummary }) | undefined> {
  const sourcePath = await resolveHtmlWidgetWorkspaceSourcePath({
    directory: input.directory,
    rawPath: input.rawPath,
  })
  const stats = await fs.stat(sourcePath.requestedAbsolutePath).catch(() => undefined)
  if (stats) return undefined

  const listed = await listObjects({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.htmlWidget,
  })
  const manifests = await Promise.all(
    listed.objects.map((object) =>
      readHtmlWidgetObjectManifest(input.directory, object.objectID).catch(() => undefined),
    ),
  )
  const matches = manifests.filter(
    (manifest): manifest is BuddyObjectManifest & { summary: HtmlWidgetObjectSummary } => {
      if (!manifest) return false
      return manifest.sourceRefs.some((ref) => {
        if (ref.role !== "original") return false
        return (
          normalizeWorkspaceRelativePath(ref.workspacePath ?? "") === sourcePath.workspacePath ||
          normalizeWorkspaceRelativePath(ref.displayPath ?? "") === sourcePath.workspacePath ||
          normalizeWorkspaceRelativePath(ref.path) === sourcePath.workspacePath
        )
      })
    },
  )
  if (matches.length === 1) return matches[0]

  if (matches.length > 1) {
    throw new HtmlWidgetValidationError(
      `HTML widget source path was already adopted by multiple widgets: ${sourcePath.workspacePath}. Use action=present_object with the intended objectID.`,
    )
  }
  return undefined
}

function validateSafeRelativePath(filepath: string, label: string): void {
  const normalized = normalizeWorkspaceRelativePath(filepath)
  if (!normalized || normalized !== filepath.replaceAll("\\", "/").replace(/^\.\//u, "").trim()) {
    throw new HtmlWidgetValidationError(`${label} must be a safe relative path.`)
  }
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const workspaceRoot = path.resolve(rootPath)
  const resolved = path.resolve(targetPath)
  const relative = path.relative(workspaceRoot, resolved)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function assertPathInsideRoot(rootPath: string, targetPath: string): Promise<void> {
  const [root, target] = await Promise.all([fs.realpath(rootPath), fs.realpath(targetPath)])
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HtmlWidgetValidationError("HTML widget source path must stay inside sourceRoot.")
  }
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.htmlWidget,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: HtmlWidgetObjectSummarySchema,
  }),
  async readManifest(input) {
    return readHtmlWidgetObjectManifest(input.directory, input.ref.objectID)
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    const manifest = await readHtmlWidgetObjectManifest(input.directory, input.ref.objectID)
    if (input.viewID !== HTML_WIDGET_RUNTIME_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported HTML widget view: ${input.viewID}`)
    }
    const result = await buildPresentHtmlWidgetObjectResult({
      directory: input.directory,
      manifest,
      originalPath: null,
      originalPathStatus: null,
    })
    return BuddyObjectViewResponseSchema.parse({
      ref: {
        kind: BUDDY_OBJECT_KINDS.htmlWidget,
        objectID: manifest.objectID,
        revisionID: null,
        itemID: null,
      },
      viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
      title: manifest.title,
      data: result.inlineData,
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== HTML_WIDGET_RUNTIME_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_html_widget_view",
        message: `Unsupported HTML widget Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: {
          kind: BUDDY_OBJECT_KINDS.htmlWidget,
          objectID: input.ref.objectID,
          revisionID: null,
          itemID: null,
        },
        viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
      },
    }
  },
})

export type { PresentHtmlWidgetObjectResult }
