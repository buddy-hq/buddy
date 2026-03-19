import type { Stats } from "node:fs"

export const RESOURCE_PACK_ROOT_DIR = ".buddy/resources" as const
export const RESOURCE_PACK_ENTRYPOINT_FILE_NAME = "RESOURCE.md" as const
export const RESOURCE_PACK_FULL_TEXT_FILE_NAME = "full.md" as const
export const RESOURCE_PACK_TOC_FILE_NAME = "toc.md" as const
export const RESOURCE_PACK_CHUNKS_DIR_NAME = "chunks" as const
export const RESOURCE_PACK_PAGES_DIR_NAME = "pages" as const

export const RESOURCE_PACK_STATUS_PREPARING = "preparing" as const
export const RESOURCE_PACK_STATUS_READY = "ready" as const
export const RESOURCE_PACK_STATUS_UNSUPPORTED = "unsupported" as const
export const RESOURCE_PACK_STATUS_ERROR = "error" as const

export const RESOURCE_PACK_CONFIDENCE_HIGH = "high" as const
export const RESOURCE_PACK_CONFIDENCE_MEDIUM = "medium" as const
export const RESOURCE_PACK_CONFIDENCE_LOW = "low" as const

export const RESOURCE_PACK_SYNC_BUDGET_MS = 1500
export const RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES = 128 * 1024
export const RESOURCE_PACK_CHUNK_TARGET_BYTES = 24 * 1024

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

export type ResourcePackConfidence =
  | typeof RESOURCE_PACK_CONFIDENCE_HIGH
  | typeof RESOURCE_PACK_CONFIDENCE_MEDIUM
  | typeof RESOURCE_PACK_CONFIDENCE_LOW

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
  confidence: ResourcePackConfidence
  format: ResourceFormat
  warnings: string[]
}

export type ResourcePackService = {
  ensureResourcePack(input: { directory: string; sourcePath: string }): Promise<ResourcePackResolution>
}

export type ResourcePackMetadata = {
  source_path: string
  source_relpath: string
  format: ResourceFormat
  status: ResourcePackStatus
  extractor: string
  prepared_at: string
  source_mtime_ms: number
  source_size_bytes: number
  chunk_count: number
  confidence: ResourcePackConfidence
  warnings: string[]
  page_count?: number
}

export type ResourceExtractionPage = {
  pageNumber: number
  markdown: string
}

export type ResourceExtractionResult = {
  status: Exclude<ResourcePackStatus, typeof RESOURCE_PACK_STATUS_PREPARING>
  confidence: ResourcePackConfidence
  warnings: string[]
  fullText: string
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
