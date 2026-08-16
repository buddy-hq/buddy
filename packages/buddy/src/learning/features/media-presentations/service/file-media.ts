import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  MediaPresentationObjectSummarySchema,
  generateObjectID,
  readObjectManifest,
  registerBuddyObjectKind,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectSourceRef,
  type BuddyObjectViewResponse,
  type MediaGalleryInlineData,
} from "../../../../objects"
import { mimeTypeForPath } from "../../../../http/mime"
import { readRawFileResponse } from "../../../../project/raw-file-response-service"
import {
  classifyWorkspaceMedia,
  type WorkspaceMediaKind as PresentedMediaKind,
  type WorkspaceMediaRenderMode as PresentedMediaRenderMode,
} from "@buddy/workspace-file-policy"

const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const MEDIA_GALLERY_VIEW_ID = "gallery" as const
const MAX_PRESENTED_MEDIA_ITEMS = 12

export const MEDIA_PRESENTATION_KIND = BUDDY_OBJECT_KINDS.mediaPresentation
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

export type PresentedMediaSummary = {
  layout: PresentedMediaLayout
  items: PresentedMediaItem[]
}

export type PresentedMediaObjectOutput = {
  objectID: string
  kind: typeof BUDDY_OBJECT_KINDS.mediaPresentation
  layout: MediaGalleryInlineData["layout"]
  items: PresentedMediaItem[]
}

type PresentedMediaObjectSummary = ReturnType<typeof MediaPresentationObjectSummarySchema.parse>

type PresentedMediaObjectManifest = BuddyObjectManifest & {
  summary: PresentedMediaObjectSummary
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

function isNodeFsErrorCode<TError>(error: TError, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

async function resolveExistingFile(absolutePath: string) {
  const realPath = await fs.realpath(absolutePath).catch((error) => {
    if (isNodeFsErrorCode(error, "ENOENT")) {
      return undefined
    }
    throw error
  })

  if (!realPath) {
    throw new PresentedMediaValidationError(PROJECT_FILE_NOT_FOUND_ERROR)
  }

  const stats = await fs.stat(realPath).catch((error) => {
    if (isNodeFsErrorCode(error, "ENOENT")) {
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

function isMissingPresentedMediaError<TError>(error: TError): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

async function refreshPresentedMediaItem(item: PresentedMediaItem): Promise<PresentedMediaItem> {
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

function fileMimeType(filepath: string) {
  return mimeTypeForPath(filepath, DEFAULT_BINARY_MIME_TYPE)
}

function classifyPresentedMedia(input: { path: string; mimeType: string | undefined }) {
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

function deriveObjectLayout(items: PresentedMediaItem[]): MediaGalleryInlineData["layout"] {
  if (items.length === 1) return "single"
  if (items.every((item) => item.mediaKind === "image")) return "grid"
  return "strip"
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

function buildPresentedMediaObjectRawUrl(input: {
  objectID: string
  itemID: string
  fileName: string
  directory: string
}) {
  return `/api/objects/media-presentation/${encodeURIComponent(input.objectID)}/raw/${encodeURIComponent(input.itemID)}?directory=${encodeURIComponent(input.directory)}&fileName=${encodeURIComponent(input.fileName)}`
}

function readStatNumber(value: number | bigint): number {
  return Number(value)
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

function mediaItemSourceRef(item: PresentedMediaItem): BuddyObjectSourceRef {
  return Object.assign(
    {
      role: "external" as const,
      path: item.absolutePath,
      displayPath: item.displayPath,
      workspacePath: item.workspacePath,
      mutable: false,
      copied: false,
      availability: item.availability.status,
      exists: item.availability.status === "available",
    },
    item.sizeBytes !== null ? { sizeBytes: item.sizeBytes } : undefined,
    item.modifiedAt !== null ? { modifiedAt: item.modifiedAt } : undefined,
  )
}

function buildMediaGalleryData(input: {
  directory: string
  objectID: string
  layout: MediaGalleryInlineData["layout"]
  items: PresentedMediaItem[]
}): MediaGalleryInlineData {
  return {
    renderer: "media-gallery",
    layout: input.layout,
    items: input.items.map((item) => ({
      itemID: item.id,
      title: item.fileName,
      mediaType: item.mediaKind,
      mimeType: item.mimeType,
      source: {
        role: "external",
        path: item.absolutePath,
        displayPath: item.displayPath,
        workspacePath: item.workspacePath,
        availability: item.availability.status,
      },
      availability: item.availability.status,
      rawUrl:
        item.availability.status === "available"
          ? buildPresentedMediaObjectRawUrl({
              directory: input.directory,
              objectID: input.objectID,
              itemID: item.id,
              fileName: item.fileName,
            })
          : null,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
    })),
  }
}

function buildPresentedMediaObjectViews(input: {
  layout: MediaGalleryInlineData["layout"]
}): BuddyObjectManifest["views"] {
  return [
    {
      viewID: MEDIA_GALLERY_VIEW_ID,
      label: "Media",
      surfaces: ["inline", "bench", "library"],
      availability: { status: "available" },
      inline: {
        renderer: "media-gallery",
        params: {
          renderer: "media-gallery",
          layout: input.layout,
        },
      },
      bench: { resolver: "object-view" },
      library: { section: "media" },
    },
  ]
}

export async function buildPresentedMediaObjectOutput(input: {
  directory: string
  title?: string
  items: Array<{
    path: string
  }>
}): Promise<{
  output: PresentedMediaObjectOutput
  manifest: PresentedMediaObjectManifest
  inlineData: MediaGalleryInlineData
}> {
  if (input.items.length === 0) {
    throw new PresentedMediaValidationError("At least one media item is required.")
  }
  if (input.items.length > MAX_PRESENTED_MEDIA_ITEMS) {
    throw new PresentedMediaValidationError(
      `Too many media items. Maximum allowed is ${MAX_PRESENTED_MEDIA_ITEMS}.`,
    )
  }

  const objectID = generateObjectID()
  const items: PresentedMediaItem[] = []
  const workspaceBoundary = await resolvePresentedMediaWorkspaceBoundary(input.directory)

  for (const [index, item] of input.items.entries()) {
    const file = await resolvePresentedMediaFile(input.directory, item.path, workspaceBoundary)
    const sizeBytes = readStatNumber(file.stats.size)
    const modifiedAt = new Date(readStatNumber(file.stats.mtimeMs)).toISOString()
    const mimeType = fileMimeType(file.absolutePath)
    const classification = classifyPresentedMedia({ path: file.displayPath, mimeType })
    const itemId = `${PRESENTED_MEDIA_ITEM_ID_PREFIX}${index + 1}`
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
      rawUrl: buildPresentedMediaObjectRawUrl({
        objectID,
        itemID: itemId,
        fileName: path.basename(file.absolutePath),
        directory: input.directory,
      }),
      actionCapabilities,
      availability: {
        status: "available",
        message: null,
      },
    })
  }

  const layout = deriveObjectLayout(items)
  const now = new Date().toISOString()
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: MediaPresentationObjectSummarySchema,
  }).parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    objectID,
    title:
      input.title ??
      (items.length === 1 ? (items[0]?.fileName ?? "Media presentation") : "Media presentation"),
    status: "ready",
    lifecycle: "external-reference",
    createdAt: now,
    updatedAt: now,
    sourceRefs: items.map(mediaItemSourceRef),
    views: buildPresentedMediaObjectViews({ layout }),
    summary: {
      kind: BUDDY_OBJECT_KINDS.mediaPresentation,
      layout,
      itemCount: items.length,
    },
  })

  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    objectID,
    manifest,
    files: [
      {
        relativePath: "state/media-items.json",
        format: "json",
        content: { items },
      },
    ],
  })

  const inlineData = buildMediaGalleryData({
    directory: input.directory,
    objectID,
    layout,
    items,
  })

  return {
    output: {
      objectID,
      kind: BUDDY_OBJECT_KINDS.mediaPresentation,
      layout,
      items,
    },
    manifest,
    inlineData,
  }
}

export async function readPresentedMediaObjectManifest(
  directory: string,
  objectID: string,
): Promise<PresentedMediaObjectManifest> {
  const manifest = await readObjectManifest({
    directory,
    kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    objectID,
  })
  return BuddyObjectManifestSchema.safeExtend({
    summary: MediaPresentationObjectSummarySchema,
  }).parse(manifest)
}

async function readPresentedMediaObjectItems(input: {
  directory: string
  objectID: string
}): Promise<PresentedMediaItem[]> {
  const parsed = await readObjectManifest({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    objectID: input.objectID,
  })
  const itemsPath = BuddyObjectPath.objectFile(
    input.directory,
    parsed.kind,
    input.objectID,
    "state/media-items.json",
  )
  const text = await fs.readFile(itemsPath, "utf8")
  const json: unknown = JSON.parse(text)
  return z.object({ items: z.array(PresentedMediaItemSchema) }).parse(json).items
}

export async function readPresentedMediaObject(input: {
  directory: string
  objectID: string
}): Promise<{
  manifest: PresentedMediaObjectManifest
  inlineData: MediaGalleryInlineData
}> {
  const manifest = await readPresentedMediaObjectManifest(input.directory, input.objectID)
  const items = await Promise.all(
    (await readPresentedMediaObjectItems(input)).map(refreshPresentedMediaItem),
  )
  return {
    manifest,
    inlineData: buildMediaGalleryData({
      directory: input.directory,
      objectID: input.objectID,
      layout: manifest.summary.layout,
      items,
    }),
  }
}

export async function readPresentedMediaObjectItemAvailability(input: {
  directory: string
  objectID: string
  itemID: string
}): Promise<PresentedMediaAvailability> {
  const item = (await readPresentedMediaObjectItems(input)).find(
    (candidate) => candidate.id === input.itemID,
  )
  if (!item) {
    throw new PresentedMediaValidationError(PROJECT_FILE_NOT_FOUND_ERROR)
  }
  return (await refreshPresentedMediaItem(item)).availability
}

export async function resolvePresentedMediaObjectItem(
  directory: string,
  objectID: string,
  itemID: string,
): Promise<{ absolutePath: string; fileName: string } | undefined> {
  try {
    const item = (await readPresentedMediaObjectItems({ directory, objectID })).find(
      (candidate) => candidate.id === itemID,
    )
    if (!item) return undefined
    return { absolutePath: item.absolutePath, fileName: item.fileName }
  } catch {
    return undefined
  }
}

export async function readPresentedMediaObjectRawResponse(input: {
  directory: string
  objectID: string
  itemID: string
  downloadName: string | undefined
  includeBody: boolean
  rangeHeader: string | undefined
  signal?: AbortSignal
}): Promise<Response> {
  const item = await resolvePresentedMediaObjectItem(input.directory, input.objectID, input.itemID)
  if (!item) {
    return Response.json({ error: PROJECT_FILE_NOT_FOUND_ERROR }, { status: 404 })
  }
  return await readRawFileResponse({
    absolutePath: item.absolutePath,
    downloadName: input.downloadName ?? item.fileName,
    includeBody: input.includeBody,
    rangeHeader: input.rangeHeader,
    signal: input.signal,
  })
}

export { PresentedMediaSummarySchema }

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.mediaPresentation,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: MediaPresentationObjectSummarySchema,
  }),
  async readManifest(input) {
    return readPresentedMediaObjectManifest(input.directory, input.ref.objectID)
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== MEDIA_GALLERY_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported media presentation view: ${input.viewID}`)
    }
    const presentation = await readPresentedMediaObject({
      directory: input.directory,
      objectID: input.ref.objectID,
    })
    return BuddyObjectViewResponseSchema.parse({
      ref: input.ref,
      viewID: MEDIA_GALLERY_VIEW_ID,
      title: presentation.manifest.title,
      data: presentation.inlineData,
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== MEDIA_GALLERY_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_media_presentation_view",
        message: `Unsupported media presentation Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: MEDIA_GALLERY_VIEW_ID,
      },
    }
  },
})
