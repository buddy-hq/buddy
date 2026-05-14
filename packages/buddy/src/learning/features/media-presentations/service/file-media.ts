import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import z from "zod"
import { buildPresentedMediaArtifactID, PresentedMediaArtifactPath } from "./artifact-path"

const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const MAX_PRESENTED_MEDIA_ITEMS = 12
const MAX_PRESENTED_MEDIA_ARTIFACTS = 500

const IMAGE_MIME_PREFIX = "image/"
const IMAGE_FILE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])
const READER_FILE_EXTENSIONS = new Set(["azw", "azw3", "cbz", "epub", "fb2", "fbz", "mobi", "pdf"])
const PRESENTATION_FILE_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"])
const DOCUMENT_FILE_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"])
const SPREADSHEET_FILE_EXTENSIONS = new Set(["csv", "ods", "tsv", "xls", "xlsx"])
const AUDIO_FILE_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"])
const VIDEO_FILE_EXTENSIONS = new Set(["avi", "m4v", "mov", "mp4", "mkv", "webm"])
const ARCHIVE_FILE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "zip"])

export const MEDIA_PRESENTATION_KIND = "media.presentation.v1" as const
export const PROJECT_FILE_ESCAPE_ERROR = "Access denied: path escapes project directory" as const
export const PROJECT_FILE_NOT_FOUND_ERROR = "File not found" as const

export type PresentedMediaKind =
  | "image"
  | "pdf"
  | "presentation"
  | "document"
  | "spreadsheet"
  | "video"
  | "audio"
  | "archive"
  | "other"
export type PresentedMediaRenderMode = "image" | "audio" | "video" | "pdf" | "file"
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
  version: number
  artifactID: string
  kind: typeof MEDIA_PRESENTATION_KIND
  layout: PresentedMediaLayout
  items: PresentedMediaItem[]
  createdAt: string
  updatedAt: string
}

export type PresentedMediaOutput = {
  presentationID: string
  kind: typeof MEDIA_PRESENTATION_KIND
  layout: PresentedMediaLayout
  items: PresentedMediaItem[]
}

export class PresentedMediaValidationError extends Error {}
export class PresentedMediaArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Presented-media artifact '${artifactID}' not found.`)
    this.name = "PresentedMediaArtifactNotFoundError"
  }
}

type ResolvedPresentedMediaFile = {
  inputPath: string
  absolutePath: string
  displayPath: string
  workspacePath: string | null
  stats: Awaited<ReturnType<typeof fs.stat>>
}

const ARTIFACT_MANIFEST_VERSION = 1
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

const PresentedMediaArtifactManifestSchema = z.object({
  version: z.literal(ARTIFACT_MANIFEST_VERSION),
  artifactID: z.string().uuid(),
  kind: z.literal(MEDIA_PRESENTATION_KIND),
  layout: z.enum(["single", "gallery", "deck", "list"]),
  items: z.array(PresentedMediaItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function fileNameFromPath(filepath: string) {
  const normalized = normalizeRelativePath(filepath)
  if (!normalized) return normalized
  const lastSlash = normalized.lastIndexOf("/")
  if (lastSlash < 0) return normalized
  return normalized.slice(lastSlash + 1)
}

function fileExtensionFromPath(filepath: string) {
  const name = fileNameFromPath(filepath).toLowerCase()
  const lastDot = name.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === name.length - 1) return ""
  return name.slice(lastDot + 1)
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

async function writeArtifactManifest(
  directory: string,
  manifest: PresentedMediaArtifactManifest,
): Promise<void> {
  await fs.mkdir(
    path.dirname(PresentedMediaArtifactPath.manifestFile(directory, manifest.artifactID)),
    {
      recursive: true,
    },
  )
  const tempPath = path.join(
    PresentedMediaArtifactPath.root(directory),
    `.${manifest.artifactID}.${crypto.randomUUID()}.tmp`,
  )
  await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await fs.rename(tempPath, PresentedMediaArtifactPath.manifestFile(directory, manifest.artifactID))
}

export async function readPresentedMediaArtifactManifest(
  directory: string,
  artifactID: string,
): Promise<PresentedMediaArtifactManifest> {
  try {
    const text = await fs.readFile(
      PresentedMediaArtifactPath.manifestFile(directory, artifactID),
      "utf8",
    )
    return PresentedMediaArtifactManifestSchema.parse(JSON.parse(text))
  } catch {
    throw new PresentedMediaArtifactNotFoundError(artifactID)
  }
}

export async function resolvePresentedMediaItem(
  directory: string,
  artifactID: string,
  itemID: string,
): Promise<{ absolutePath: string; fileName: string } | undefined> {
  try {
    const manifest = await readPresentedMediaArtifactManifest(directory, artifactID)
    const item = manifest.items.find((candidate) => candidate.id === itemID)
    if (!item) return undefined
    return { absolutePath: item.absolutePath, fileName: item.fileName }
  } catch {
    // artifact doesn't exist
  }
  return undefined
}

async function pruneOldArtifacts(directory: string): Promise<void> {
  try {
    const entries = await fs.readdir(PresentedMediaArtifactPath.root(directory), {
      withFileTypes: true,
    })
    const artifacts = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifestPath = PresentedMediaArtifactPath.manifestFile(directory, entry.name)
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
        fs.rm(path.join(PresentedMediaArtifactPath.root(directory), name), {
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

function isImageMimeType(mimeType: string | undefined) {
  return mimeType?.startsWith(IMAGE_MIME_PREFIX) ?? false
}

function classifyPresentedMedia(input: { path: string; mimeType: string | undefined }): {
  mediaKind: PresentedMediaKind
  renderMode: PresentedMediaRenderMode
} {
  const extension = fileExtensionFromPath(input.path)
  const mimeType = input.mimeType?.toLowerCase()

  const mediaKind: PresentedMediaKind =
    isImageMimeType(mimeType) || IMAGE_FILE_EXTENSIONS.has(extension)
      ? "image"
      : extension === "pdf"
        ? "pdf"
        : PRESENTATION_FILE_EXTENSIONS.has(extension)
          ? "presentation"
          : DOCUMENT_FILE_EXTENSIONS.has(extension)
            ? "document"
            : SPREADSHEET_FILE_EXTENSIONS.has(extension)
              ? "spreadsheet"
              : AUDIO_FILE_EXTENSIONS.has(extension)
                ? "audio"
                : VIDEO_FILE_EXTENSIONS.has(extension)
                  ? "video"
                  : ARCHIVE_FILE_EXTENSIONS.has(extension)
                    ? "archive"
                    : "other"

  const renderMode: PresentedMediaRenderMode =
    mediaKind === "image"
      ? "image"
      : mediaKind === "audio"
        ? "audio"
        : mediaKind === "video"
          ? "video"
          : mediaKind === "pdf" || READER_FILE_EXTENSIONS.has(extension)
            ? "pdf"
            : "file"

  return { mediaKind, renderMode }
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
): Promise<ResolvedPresentedMediaFile> {
  const absolutePath = normalizeInputSourcePath(directory, inputPath)
  const file = await resolveExistingFile(absolutePath)
  const canOpenInWorkspacePanel = OpenCodeInstance.containsPath(file.realPath)
  const workspacePath = canOpenInWorkspacePanel
    ? normalizeRelativePath(path.relative(directory, file.realPath))
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
  return `/api/presented-media/${encodeURIComponent(input.artifactID)}/raw/${encodeURIComponent(input.itemID)}?directory=${encodeURIComponent(input.directory)}&fileName=${encodeURIComponent(input.fileName)}`
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

  const artifactID = buildPresentedMediaArtifactID()
  const items: PresentedMediaItem[] = []

  for (const [index, item] of input.items.entries()) {
    const file = await resolvePresentedMediaFile(input.directory, item.path)
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
    kind: MEDIA_PRESENTATION_KIND,
    layout,
    items,
    createdAt: now,
    updatedAt: now,
  }

  await writeArtifactManifest(input.directory, manifest)
  await pruneOldArtifacts(input.directory)

  return {
    presentationID: artifactID,
    kind: MEDIA_PRESENTATION_KIND,
    layout,
    items,
  }
}

export async function buildPresentedMediaOutputForPath(input: { directory: string; path: string }) {
  return buildPresentedMediaOutput({
    directory: input.directory,
    items: [
      {
        path: input.path,
      },
    ],
  })
}
