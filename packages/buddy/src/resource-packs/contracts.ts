import type { Stats } from "node:fs"
import {
  RESOURCE_PACK_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_FILE_KIND_FULL_TEXT,
  RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK,
  RESOURCE_PACK_FILE_KIND_PAGE,
  RESOURCE_PACK_FILE_KIND_PAGE_WINDOW,
  RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
  RESOURCE_PACK_FILE_KIND_TOC,
  RESOURCE_PACK_FILE_KIND_UNIT,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES,
  RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
  RESOURCE_PACK_SPLIT_REASON_INTACT,
  RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD,
  RESOURCE_PACK_TOC_FILE_NAME,
  RESOURCE_PACK_UNIT_KIND_CHAPTER,
  RESOURCE_PACK_UNIT_KIND_GENERIC,
  RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW,
  RESOURCE_PACK_UNIT_KIND_SECTION,
} from "./chunking-config"

export {
  RESOURCE_PACK_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_TOC_FILE_NAME,
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES,
  RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
  RESOURCE_PACK_FILE_KIND_TOC,
  RESOURCE_PACK_FILE_KIND_FULL_TEXT,
  RESOURCE_PACK_FILE_KIND_UNIT,
  RESOURCE_PACK_FILE_KIND_PAGE_WINDOW,
  RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK,
  RESOURCE_PACK_FILE_KIND_PAGE,
  RESOURCE_PACK_UNIT_KIND_CHAPTER,
  RESOURCE_PACK_UNIT_KIND_SECTION,
  RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW,
  RESOURCE_PACK_UNIT_KIND_GENERIC,
  RESOURCE_PACK_SPLIT_REASON_INTACT,
  RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD,
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
}

export const RESOURCE_PACK_STATUS_PREPARING = "preparing" as const
export const RESOURCE_PACK_STATUS_READY = "ready" as const
export const RESOURCE_PACK_STATUS_UNSUPPORTED = "unsupported" as const
export const RESOURCE_PACK_STATUS_ERROR = "error" as const

export const RESOURCE_PACK_SYNC_BUDGET_MS = 1500
export const RESOURCE_PACK_CHUNK_TARGET_BYTES = RESOURCE_PACK_NON_CHAPTER_MAX_CHARS

export const RESOURCE_PACK_CHUNK_PREFIX = "chunk" as const
export const RESOURCE_PACK_ENTRYPOINT_TITLE = "Resource" as const
export const RESOURCE_PACK_TOC_TITLE = "Table of Contents" as const
export const RESOURCE_PACK_NO_TEXT_MARKER = "(No text could be extracted.)" as const
export const RESOURCE_PACK_PREPARING_WARNING = "The resource is still being prepared." as const
export const RESOURCE_PACK_UNSUPPORTED_WARNING =
  "Buddy could not extract a usable text representation." as const

export type ResourcePackStatus =
  | typeof RESOURCE_PACK_STATUS_PREPARING
  | typeof RESOURCE_PACK_STATUS_READY
  | typeof RESOURCE_PACK_STATUS_UNSUPPORTED
  | typeof RESOURCE_PACK_STATUS_ERROR

export type ResourceFormat =
  | "pdf"
  | "epub"
  | "docx"
  | "html"
  | "htm"
  | "xhtml"
  | "markdown"
  | "text"
  | "json"
  | "jsonc"
  | "yaml"
  | "yml"
  | "csv"
  | "code"
  | "unknown"

export type ResourceClassification = {
  kind: "direct" | "pack"
  format: ResourceFormat
  mime: string
}

export type ResourceChunkFileKind =
  | typeof RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX
  | typeof RESOURCE_PACK_FILE_KIND_TOC
  | typeof RESOURCE_PACK_FILE_KIND_FULL_TEXT
  | typeof RESOURCE_PACK_FILE_KIND_UNIT
  | typeof RESOURCE_PACK_FILE_KIND_PAGE_WINDOW
  | typeof RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK
  | typeof RESOURCE_PACK_FILE_KIND_PAGE

export type ResourceChunkUnitKind =
  | typeof RESOURCE_PACK_UNIT_KIND_CHAPTER
  | typeof RESOURCE_PACK_UNIT_KIND_SECTION
  | typeof RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW
  | typeof RESOURCE_PACK_UNIT_KIND_GENERIC

export type ResourceChunkSplitReason =
  | typeof RESOURCE_PACK_SPLIT_REASON_INTACT
  | typeof RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD
  | typeof RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE

export type ResourceChunkUnitSeed = {
  unitKind: ResourceChunkUnitKind
  unitTitle?: string
  unitIndex?: number
  text: string
  splitReason?: ResourceChunkSplitReason
  pageStart?: number
  pageEnd?: number
}

export type ResourceChunkFileRecord = {
  filename: string
  content: string
}

export type ResourcePackResolution = {
  sourcePath: string
  sourceRelpath: string
  packKey: string
  packRootPath: string
  metadataPath: string
  entrypointPath: string
  fullPath: string
  tocPath?: string
  status: ResourcePackStatus
  format: ResourceFormat
  warnings: string[]
}

export type ResourcePackService = {
  ensureResourcePack(input: { directory: string; sourcePath: string }): Promise<ResourcePackResolution>
}

export type ResourcePackMetadata = {
  resource_alias?: string
  source_path: string
  source_relpath: string
  format: ResourceFormat
  status: ResourcePackStatus
  extractor: string
  prepared_at: string
  source_mtime_ms: number
  source_size_bytes: number
  chunk_count: number
  warnings: string[]
  full_text_file?: string
  page_count?: number
}

export type ResourceExtractionPage = {
  pageNumber: number
  markdown: string
}

export type ResourceExtractionResult = {
  status: Exclude<ResourcePackStatus, typeof RESOURCE_PACK_STATUS_PREPARING>
  warnings: string[]
  fullText: string
  chunkMarkdowns?: string[]
  chunkUnits?: ResourceChunkUnitSeed[]
  tocMarkdown?: string
  pageMarkdowns?: ResourceExtractionPage[]
  extractor: string
}

export type PackPaths = {
  rootPath: string
  metadataPath: string
  entrypointPath: string
  fullPath: string
  tocPath: string
  chunksDirPath: string
  pagesDirPath: string
}

export type ResourcePackBuildInput = {
  directory: string
  sourcePath: string
  sourceRelpath: string
  sourceStat: Stats
  packPaths: PackPaths
  classification: ResourceClassification
}
