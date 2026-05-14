import {
  buildProjectFileRawParameters,
  CONTENT_LENGTH_HEADER,
  CONTENT_TYPE_HEADER,
} from "@/lib/project-file-raw-url"
import { buddyResultMessage, getBuddyClient } from "@/lib/buddy-client"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"

const LARGE_TEXT_FILE_LIMIT_BYTES = 1_000_000
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

export type WorkspaceMediaKind =
  | "image"
  | "pdf"
  | "presentation"
  | "document"
  | "spreadsheet"
  | "video"
  | "audio"
  | "archive"
  | "other"

export type WorkspaceMediaRenderMode = "image" | "audio" | "video" | "pdf" | "file"

export type WorkspaceFileRawMetadata = {
  sizeBytes: number | undefined
  mimeType: string | undefined
}

export function isImageMimeType(mimeType: string | undefined) {
  return mimeType?.startsWith(IMAGE_MIME_PREFIX) ?? false
}

export function isWorkspaceImagePath(filepath: string) {
  return IMAGE_FILE_EXTENSIONS.has(fileExtensionFromPath(filepath))
}

export function isWorkspaceReaderPath(filepath: string) {
  return READER_FILE_EXTENSIONS.has(fileExtensionFromPath(filepath))
}

export function shouldOpenFileInDefaultAppBySize(input: {
  path: string
  sizeBytes: number | undefined
  mimeType: string | undefined
}) {
  if (typeof input.sizeBytes !== "number") return false
  if (input.sizeBytes <= LARGE_TEXT_FILE_LIMIT_BYTES) return false
  if (isImageMimeType(input.mimeType) || isWorkspaceImagePath(input.path)) return false
  return true
}

export function canOpenWorkspaceFileInPanel(input: {
  path: string
  mimeType: string | undefined
  sizeBytes: number | undefined
}) {
  const classification = classifyWorkspaceMedia(input)
  if (classification.renderMode === "image" || classification.renderMode === "pdf") {
    return true
  }
  if (shouldOpenFileInDefaultAppBySize(input)) {
    return false
  }
  return classification.mediaKind === "other"
}

export function classifyWorkspaceMedia(input: {
  path: string
  mimeType: string | undefined
  sizeBytes: number | undefined
}): {
  mediaKind: WorkspaceMediaKind
  renderMode: WorkspaceMediaRenderMode
  fileName: string
} {
  const normalizedPath = normalizeRelativePath(input.path)
  const extension = fileExtensionFromPath(normalizedPath)
  const mimeType = input.mimeType?.toLowerCase()

  const mediaKind: WorkspaceMediaKind =
    isImageMimeType(mimeType) || isWorkspaceImagePath(normalizedPath)
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

  const renderMode: WorkspaceMediaRenderMode =
    mediaKind === "image"
      ? "image"
      : mediaKind === "audio"
        ? "audio"
        : mediaKind === "video"
          ? "video"
          : mediaKind === "pdf" || isWorkspaceReaderPath(normalizedPath)
            ? "pdf"
            : "file"

  return {
    mediaKind,
    renderMode,
    fileName: fileNameFromPath(normalizedPath),
  }
}

export async function readWorkspaceFileRawMetadata(input: {
  directory: string
  path: string
}): Promise<WorkspaceFileRawMetadata> {
  const response = await getBuddyClient(input.directory).headApiFileRawFileName(
    buildProjectFileRawParameters(input.path),
  )
  if (!response.response?.ok) {
    throw new Error(buddyResultMessage(response))
  }

  const sizeHeader = response.response.headers.get(CONTENT_LENGTH_HEADER)
  const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN
  return {
    sizeBytes: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined,
    mimeType: response.response.headers.get(CONTENT_TYPE_HEADER) ?? undefined,
  }
}
