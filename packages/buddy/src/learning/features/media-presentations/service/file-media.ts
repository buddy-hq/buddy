import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import z from "zod"
import {
  ARTIFACT_KINDS,
  ARTIFACT_MANIFEST_VERSION,
  ArtifactPath,
  ArtifactManifestBaseSchema,
  type ArtifactLoadErrorRecord,
  generateArtifactID,
  listArtifactManifests,
  readArtifactManifest,
  writeArtifactRecord,
} from "../../../../artifacts"
import { readRawFileResponse } from "../../../../project/raw-file-response-service"
import {
  classifyWorkspaceMedia,
  type WorkspaceMediaKind as PresentedMediaKind,
  type WorkspaceMediaRenderMode as PresentedMediaRenderMode,
} from "@buddy/workspace-file-policy"

const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const MAX_PRESENTED_MEDIA_ITEMS = 12
const MAX_PRESENTED_MEDIA_ARTIFACTS = 500

export const MEDIA_PRESENTATION_KIND = ARTIFACT_KINDS.mediaPresentation
export const PROJECT_FILE_ESCAPE_ERROR = "Access denied: path escapes project directory" as const
export const PROJECT_FILE_NOT_FOUND_ERROR = "File not found" as const

export type PresentedMediaLayout = "single" | "gallery" | "deck" | "list"

export type PresentedMediaActionCapabilities = {
  canOpenDefaultApp: boolean
  canRevealInFileManager: boolean
  canOpenInWorkspacePanel: boolean
}

export type PresentedMediaAvailability = {
  status: "available" | "missing" | "error"
  message: string | null
}

export type PresentedMediaItem = {
  id: string
  inputPath: string
  absolutePath: string
  displayPath: string
  workspacePath: string | null
  fileName: string
  mediaKind: PresentedMediaKind
  renderMode: PresentedMediaRenderMode
  mimeType: string | null
  sizeBytes: number | null
  modifiedAt: string | null
  rawUrl: string
  actionCapabilities: PresentedMediaActionCapabilities
  availability: PresentedMediaAvailability
}

export type PresentedMediaArtifactManifest = {
  version: typeof ARTIFACT_MANIFEST_VERSION
  artifactID: string
  kind: typeof ARTIFACT_KINDS.mediaPresentation
  title: string
  description?: string
  origin?: unknown
  createdAt: string
  updatedAt: string
  summary: PresentedMediaSummary
}

export type PresentedMediaSummary = {
  layout: PresentedMediaLayout
  items: PresentedMediaItem[]
}

export type PresentedMediaOutput = {
  artifactID: string
  kind: typeof ARTIFACT_KINDS.mediaPresentation
  layout: PresentedMediaLayout
  items: PresentedMediaItem[]
}

export type PresentedMediaArtifactSummaryListResult = {
  artifacts: PresentedMediaArtifactManifest[]
  loadErrors: ArtifactLoadErrorRecord[]
}

export type PresentedMediaPathInfo = Omit<PresentedMediaItem, "id" | "rawUrl">

export class PresentedMediaValidationError extends Error {}

type ResolvedPresentedMediaFile = {
  inputPath: string
  absolutePath: string
  displayPath: string
  workspacePath: string | null
  stats: Awaited<ReturnType<typeof fs.stat>>
}
type PresentedMediaWorkspaceBoundary = {
  directoryPath: string
}

const PRESENTED_MEDIA_ITEM_ID_PREFIX = "media_item_"

const PresentedMediaActionCapabilitiesSchema = z.object({
  canOpenDefaultApp: z.boolean(),
  canRevealInFileManager: z.boolean(),
  canOpenInWorkspacePanel: z.boolean(),
})

const PresentedMediaAvailabilitySchema = z.object({
  status: z.enum(["available", "missing", "error"]),
  message: z.string().nullable(),
})

const PresentedMediaItemSchema = z.object({
  id: z.string().min(1),
  inputPath: z.string().min(1),
  absolutePath: z.string().min(1),
  displayPath: z.string().min(1),
  workspacePath: z.string().nullable(),
  fileName: z.string().min(1),
  mediaKind: z.enum([
    "image",
    "pdf",
    "presentation",
    "document",
    "spreadsheet",
    "video",
    "audio",
    "archive",
    "other",
  ]),
  renderMode: z.enum(["image", "audio", "video", "pdf", "file"]),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().nullable(),
  rawUrl: z.string().min(1),
  actionCapabilities: PresentedMediaActionCapabilitiesSchema,
  availability: PresentedMediaAvailabilitySchema,
})

const PresentedMediaSummarySchema = z.object({
  layout: z.enum(["single", "gallery", "deck", "list"]),
  items: z.array(PresentedMediaItemSchema),
})

const PresentedMediaArtifactManifestSchema = ArtifactManifestBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.mediaPresentation),
  summary: PresentedMediaSummarySchema,
})

function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function normalizeInputSourcePath(directory: string, inputPath: string) {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    throw new PresentedMediaValidationError("Path must not be empty.")
  }

  if (trimmed.startsWith("file://")) {
    try {
      return fileURLToPath(trimmed)
    } catch {
      throw new PresentedMediaValidationError("File URL could not be resolved to a local path.")
    }
  }

  if (trimmed === "~") {
    return os.homedir()
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2))
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed
  }

  return path.resolve(directory, normalizeRelativePath(trimmed))
}

async function resolveExistingFile(absolutePath: string) {
  const realPath = await fs.realpath(absolutePath).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!realPath) {
    throw new PresentedMediaValidationError(PROJECT_FILE_NOT_FOUND_ERROR)
  }

  const stats = await fs.stat(realPath).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!stats?.isFile()) {
    throw new PresentedMediaValidationError(PROJECT_FILE_NOT_FOUND_ERROR)
  }

  return { realPath, stats }
}

async function resolvePresentedMediaWorkspaceBoundary(
  directory: string,
): Promise<PresentedMediaWorkspaceBoundary> {
  const resolvedDirectory = path.resolve(directory)
  const directoryPath = await fs.realpath(resolvedDirectory).catch(() => resolvedDirectory)
  return { directoryPath }
}

function isPathWithinBoundary(boundaryPath: string, targetPath: string) {
  const relative = path.relative(boundaryPath, targetPath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function writeArtifactManifest(
  directory: string,
  manifest: PresentedMediaArtifactManifest,
): Promise<void> {
  await writeArtifactRecord({
    directory,
    kind: ARTIFACT_KINDS.mediaPresentation,
    artifactID: manifest.artifactID,
    manifest,
  })
}

function isMissingPresentedMediaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

async function refreshPresentedMediaItem(
  item: PresentedMediaItem,
): Promise<PresentedMediaItem> {
  try {
    const stats = await fs.stat(item.absolutePath)
    if (!stats.isFile()) {
      return {
        ...item,
        availability: {
          status: "missing",
          message: PROJECT_FILE_NOT_FOUND_ERROR,
        },
      }
    }

    const mimeType = fileMimeType(item.absolutePath)
    const classification = classifyPresentedMedia({ path: item.displayPath, mimeType })
    return {
      ...item,
      mediaKind: classification.mediaKind,
      renderMode: classification.renderMode,
      mimeType,
      sizeBytes: readStatNumber(stats.size),
      modifiedAt: new Date(readStatNumber(stats.mtimeMs)).toISOString(),
      availability: {
        status: "available",
        message: null,
      },
    }
  } catch (error) {
    return {
      ...item,
      availability: {
        status: isMissingPresentedMediaError(error) ? "missing" : "error",
        message: isMissingPresentedMediaError(error)
          ? PROJECT_FILE_NOT_FOUND_ERROR
          : "Unable to access file",
      },
    }
  }
}

async function refreshPresentedMediaArtifactManifest(
  manifest: PresentedMediaArtifactManifest,
): Promise<PresentedMediaArtifactManifest> {
  return {
    ...manifest,
    summary: {
      ...manifest.summary,
      items: await Promise.all(manifest.summary.items.map(refreshPresentedMediaItem)),
    },
  }
}

export async function readPresentedMediaArtifactManifest(
  directory: string,
  artifactID: string,
): Promise<PresentedMediaArtifactManifest> {
  return readArtifactManifest({
    directory,
    kind: ARTIFACT_KINDS.mediaPresentation,
    artifactID,
    schema: PresentedMediaArtifactManifestSchema,
  })
}

export async function readPresentedMediaArtifact(
  directory: string,
  artifactID: string,
): Promise<PresentedMediaArtifactManifest> {
  const manifest = await readPresentedMediaArtifactManifest(directory, artifactID)
  return refreshPresentedMediaArtifactManifest(manifest)
}

export async function readPresentedMediaItemAvailability(input: {
  directory: string
  artifactID: string
  itemID: string
}): Promise<PresentedMediaAvailability> {
  const manifest = await readPresentedMediaArtifactManifest(input.directory, input.artifactID)
  const item = manifest.summary.items.find((candidate) => candidate.id === input.itemID)
  if (!item) {
    throw new PresentedMediaValidationError(PROJECT_FILE_NOT_FOUND_ERROR)
  }
  return (await refreshPresentedMediaItem(item)).availability
}

export async function resolvePresentedMediaItem(
  directory: string,
  artifactID: string,
  itemID: string,
): Promise<{ absolutePath: string; fileName: string } | undefined> {
  try {
    const manifest = await readPresentedMediaArtifactManifest(directory, artifactID)
    const item = manifest.summary.items.find((candidate) => candidate.id === itemID)
    if (!item) return undefined
    return { absolutePath: item.absolutePath, fileName: item.fileName }
  } catch {
    // artifact doesn't exist
  }
  return undefined
}

export async function readPresentedMediaRawArtifactResponse(input: {
  directory: string
  artifactID: string
  itemID: string
  downloadName: string | undefined
  includeBody: boolean
  rangeHeader: string | undefined
}): Promise<Response> {
  const item = await resolvePresentedMediaItem(input.directory, input.artifactID, input.itemID)
  if (!item) {
    return Response.json({ error: PROJECT_FILE_NOT_FOUND_ERROR }, { status: 404 })
  }
  return readRawFileResponse({
    absolutePath: item.absolutePath,
    downloadName: input.downloadName ?? item.fileName,
    includeBody: input.includeBody,
    rangeHeader: input.rangeHeader,
  })
}

async function pruneOldArtifacts(directory: string): Promise<void> {
  try {
    const root = ArtifactPath.kindRoot(directory, ARTIFACT_KINDS.mediaPresentation)
    const entries = await fs.readdir(root, {
      withFileTypes: true,
    })
    const artifacts = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifestPath = ArtifactPath.manifestFile(
            directory,
            ARTIFACT_KINDS.mediaPresentation,
            entry.name,
          )
          const stats = await fs.stat(manifestPath)
          return { artifactID: entry.name, mtimeMs: stats.mtimeMs }
        }),
    )

    if (artifacts.length <= MAX_PRESENTED_MEDIA_ARTIFACTS) return

    const toRemove = artifacts
      .toSorted((left, right) => left.mtimeMs - right.mtimeMs)
      .slice(0, artifacts.length - MAX_PRESENTED_MEDIA_ARTIFACTS)
      .map((artifact) => artifact.artifactID)
    await Promise.all(
      toRemove.map((name) =>
        fs.rm(ArtifactPath.artifactDirectory(directory, ARTIFACT_KINDS.mediaPresentation, name), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch {
    // root directory doesn't exist yet, nothing to prune
  }
}

function fileMimeType(filepath: string) {
  return Bun.file(filepath).type || DEFAULT_BINARY_MIME_TYPE
}

function classifyPresentedMedia(input: { path: string; mimeType: string | undefined }): {
  mediaKind: PresentedMediaKind
  renderMode: PresentedMediaRenderMode
} {
  const classification = classifyWorkspaceMedia({
    path: input.path,
    mimeType: input.mimeType,
    sizeBytes: undefined,
  })
  return {
    mediaKind: classification.mediaKind,
    renderMode: classification.renderMode,
  }
}

function deriveLayout(items: PresentedMediaItem[]): PresentedMediaLayout {
  if (items.length === 1) return "single"
  if (items.every((item) => item.mediaKind === "image")) return "gallery"
  return "list"
}

export function normalizePresentedMediaPermissionPath(directory: string, inputPath: string) {
  return normalizeInputSourcePath(directory, inputPath)
}

async function resolvePresentedMediaFile(
  directory: string,
  inputPath: string,
  workspaceBoundary: PresentedMediaWorkspaceBoundary,
): Promise<ResolvedPresentedMediaFile> {
  const absolutePath = normalizeInputSourcePath(directory, inputPath)
  const file = await resolveExistingFile(absolutePath)
  const canOpenInWorkspacePanel = isPathWithinBoundary(
    workspaceBoundary.directoryPath,
    file.realPath,
  )
  const workspacePath = canOpenInWorkspacePanel
    ? normalizeRelativePath(path.relative(workspaceBoundary.directoryPath, file.realPath))
    : null

  return {
    inputPath,
    absolutePath: file.realPath,
    displayPath: workspacePath ?? file.realPath,
    workspacePath,
    stats: file.stats,
  }
}

function buildPresentedMediaRawUrl(input: {
  artifactID: string
  itemID: string
  fileName: string
  directory: string
}) {
  return `/api/artifacts/media-presentation/${encodeURIComponent(input.artifactID)}/raw/${encodeURIComponent(input.itemID)}?directory=${encodeURIComponent(input.directory)}&fileName=${encodeURIComponent(input.fileName)}`
}

function readStatNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value
}

function buildActionCapabilities(input: {
  workspacePath: string | null
}): PresentedMediaActionCapabilities {
  return {
    canOpenDefaultApp: true,
    canRevealInFileManager: true,
    canOpenInWorkspacePanel: input.workspacePath !== null,
  }
}

export async function resolvePresentedMediaPathInfo(input: {
  directory: string
  path: string
}): Promise<PresentedMediaPathInfo> {
  const workspaceBoundary = await resolvePresentedMediaWorkspaceBoundary(input.directory)
  const file = await resolvePresentedMediaFile(input.directory, input.path, workspaceBoundary)
  const sizeBytes = readStatNumber(file.stats.size)
  const modifiedAt = new Date(readStatNumber(file.stats.mtimeMs)).toISOString()
  const mimeType = fileMimeType(file.absolutePath)
  const classification = classifyPresentedMedia({ path: file.displayPath, mimeType })

  return {
    inputPath: file.inputPath,
    absolutePath: file.absolutePath,
    displayPath: file.displayPath,
    workspacePath: file.workspacePath,
    fileName: path.basename(file.absolutePath),
    mediaKind: classification.mediaKind,
    renderMode: classification.renderMode,
    mimeType,
    sizeBytes,
    modifiedAt,
    actionCapabilities: buildActionCapabilities({
      workspacePath: file.workspacePath,
    }),
    availability: {
      status: "available",
      message: null,
    },
  }
}

export async function buildPresentedMediaOutput(input: {
  directory: string
  items: Array<{
    path: string
  }>
}): Promise<PresentedMediaOutput> {
  if (input.items.length === 0) {
    throw new PresentedMediaValidationError("At least one media item is required.")
  }
  if (input.items.length > MAX_PRESENTED_MEDIA_ITEMS) {
    throw new PresentedMediaValidationError(
      `Too many media items. Maximum allowed is ${MAX_PRESENTED_MEDIA_ITEMS}.`,
    )
  }

  const artifactID = generateArtifactID()
  const items: PresentedMediaItem[] = []
  const workspaceBoundary = await resolvePresentedMediaWorkspaceBoundary(input.directory)

  for (const [index, item] of input.items.entries()) {
    const file = await resolvePresentedMediaFile(input.directory, item.path, workspaceBoundary)
    const sizeBytes = readStatNumber(file.stats.size)
    const modifiedAt = new Date(readStatNumber(file.stats.mtimeMs)).toISOString()
    const mimeType = fileMimeType(file.absolutePath)
    const classification = classifyPresentedMedia({ path: file.displayPath, mimeType })
    const itemId = `${PRESENTED_MEDIA_ITEM_ID_PREFIX}${index + 1}`
    const rawUrl = buildPresentedMediaRawUrl({
      artifactID,
      itemID: itemId,
      fileName: path.basename(file.absolutePath),
      directory: input.directory,
    })
    const actionCapabilities = buildActionCapabilities({
      workspacePath: file.workspacePath,
    })

    items.push({
      id: itemId,
      inputPath: file.inputPath,
      absolutePath: file.absolutePath,
      displayPath: file.displayPath,
      workspacePath: file.workspacePath,
      fileName: path.basename(file.absolutePath),
      mediaKind: classification.mediaKind,
      renderMode: classification.renderMode,
      mimeType,
      sizeBytes,
      modifiedAt,
      rawUrl,
      actionCapabilities,
      availability: {
        status: "available",
        message: null,
      },
    })
  }

  const layout = deriveLayout(items)
  const now = new Date().toISOString()
  const manifest: PresentedMediaArtifactManifest = {
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID,
    kind: ARTIFACT_KINDS.mediaPresentation,
    title: items.length === 1 ? items[0]?.fileName ?? "Media presentation" : "Media presentation",
    createdAt: now,
    updatedAt: now,
    summary: {
      layout,
      items,
    },
  }

  await writeArtifactManifest(input.directory, manifest)
  await pruneOldArtifacts(input.directory)

  return {
    artifactID,
    kind: ARTIFACT_KINDS.mediaPresentation,
    layout,
    items,
  }
}

export async function listPresentedMediaArtifactSummaries(
  directory: string,
): Promise<PresentedMediaArtifactSummaryListResult> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.mediaPresentation,
    schema: PresentedMediaArtifactManifestSchema,
  })
  return {
    artifacts: await Promise.all(result.items.map(refreshPresentedMediaArtifactManifest)),
    loadErrors: result.loadErrors,
  }
}

export {
  PresentedMediaArtifactManifestSchema,
  PresentedMediaSummarySchema,
}
