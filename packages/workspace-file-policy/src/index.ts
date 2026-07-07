export const LARGE_TEXT_FILE_LIMIT_BYTES = 1_000_000
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

const READER_FILE_EXTENSIONS = new Set(["epub", "pdf"])
const PDF_HEADER = new TextEncoder().encode("%PDF-")
const ZIP_LOCAL_FILE_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
const HTML_PREFIX_PATTERN = /^\s*(?:<!doctype\s+html|<html|<head|<body)\b/iu
const PRESENTATION_FILE_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"])
const DOCUMENT_FILE_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"])
const SPREADSHEET_FILE_EXTENSIONS = new Set(["csv", "ods", "tsv", "xls", "xlsx"])
const TEXT_SPREADSHEET_FILE_EXTENSIONS = new Set(["csv", "tsv"])
const AUDIO_FILE_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"])
const VIDEO_FILE_EXTENSIONS = new Set(["avi", "m4v", "mov", "mp4", "mkv", "webm"])
const ARCHIVE_FILE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "zip"])

export type MarkdownBenchDocumentFormat = "markdown" | "mdx"
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
export type ReaderSourceFormat = "pdf" | "epub"
export type ReaderSourceValidity = "valid" | "invalid" | "unknown"
export type ReaderSourceInspection = {
  format: ReaderSourceFormat | null
  sourceValidity: ReaderSourceValidity
  reason: string | null
}

function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/u, "").replace(/\/+$/u, "")
}

function fileNameFromPath(filepath: string) {
  const normalized = normalizeRelativePath(filepath)
  if (!normalized) return normalized
  const lastSlash = normalized.lastIndexOf("/")
  return lastSlash < 0 ? normalized : normalized.slice(lastSlash + 1)
}

export function fileExtensionFromPath(filepath: string) {
  const name = fileNameFromPath(filepath).toLowerCase()
  const lastDot = name.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === name.length - 1) return ""
  return name.slice(lastDot + 1)
}

export function readerSourceFormatFromPath(filepath: string): ReaderSourceFormat | null {
  const extension = fileExtensionFromPath(filepath)
  if (extension === "pdf" || extension === "epub") return extension
  return null
}

function bytesStartWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  if (bytes.byteLength < signature.byteLength) return false
  return signature.every((value, index) => bytes[index] === value)
}

function bytesContain(bytes: Uint8Array, signature: Uint8Array): boolean {
  const lastOffset = bytes.byteLength - signature.byteLength
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    if (signature.every((value, index) => bytes[offset + index] === value)) return true
  }
  return false
}

function prefixText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512))
}

export function inspectReaderSourceBytes(input: {
  path: string
  bytes: Uint8Array
}): ReaderSourceInspection {
  const format = readerSourceFormatFromPath(input.path)
  if (!format) {
    return { format: null, sourceValidity: "unknown", reason: null }
  }

  if (HTML_PREFIX_PATTERN.test(prefixText(input.bytes))) {
    return {
      format,
      sourceValidity: "invalid",
      reason: `The .${format} file contains HTML instead of a ${format.toUpperCase()} document.`,
    }
  }

  const hasExpectedSignature =
    format === "pdf"
      ? bytesContain(input.bytes, PDF_HEADER)
      : bytesStartWith(input.bytes, ZIP_LOCAL_FILE_HEADER)
  if (!hasExpectedSignature) {
    return {
      format,
      sourceValidity: "invalid",
      reason:
        format === "pdf"
          ? "The file does not have a PDF header."
          : "The file is not a ZIP-based EPUB container.",
    }
  }

  return { format, sourceValidity: "valid", reason: null }
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

export function markdownBenchDocumentFormatFromPath(
  filepath: string,
): MarkdownBenchDocumentFormat | null {
  const extension = fileExtensionFromPath(filepath)
  if (extension === "md") return "markdown"
  if (extension === "mdx") return "mdx"
  return null
}

export function isMarkdownBenchPath(filepath: string) {
  return markdownBenchDocumentFormatFromPath(filepath) !== null
}

export function isWorkspaceFileOverSoftLimit(input: {
  path: string
  sizeBytes: number | undefined
  mimeType: string | undefined
}) {
  if (typeof input.sizeBytes !== "number") return false
  if (input.sizeBytes <= LARGE_TEXT_FILE_LIMIT_BYTES) return false
  const classification = classifyWorkspaceMedia(input)
  return classification.renderMode === "file"
}

export const shouldOpenFileInDefaultAppBySize = isWorkspaceFileOverSoftLimit

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
          : mediaKind === "pdf"
            ? "pdf"
            : "file"

  return {
    mediaKind,
    renderMode,
    fileName: fileNameFromPath(normalizedPath),
  }
}

export function canOpenWorkspaceFileOnBench(input: {
  path: string
  mimeType: string | undefined
  sizeBytes: number | undefined
}) {
  const classification = classifyWorkspaceMedia(input)
  return (
    classification.renderMode === "image" ||
    classification.renderMode === "audio" ||
    classification.renderMode === "video" ||
    classification.mediaKind === "pdf" ||
    TEXT_SPREADSHEET_FILE_EXTENSIONS.has(fileExtensionFromPath(input.path)) ||
    classification.mediaKind === "other"
  )
}

export const canOpenWorkspaceFileInPanel = canOpenWorkspaceFileOnBench
