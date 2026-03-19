import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { buildResourcePackEntryMarkdown, wrapChunkMarkdown } from "./markdown"
import type {
  ResourceExtractionPage,
  ResourceFormat,
  ResourcePackBuildInput,
  ResourcePackMetadata,
  ResourcePackResolution,
  ResourcePackStatus,
} from "./contracts"
import {
  RESOURCE_PACK_STATUS_ERROR,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_PREPARING_WARNING,
} from "./contracts"

export async function exists(filepath: string) {
  return fs.stat(filepath).then(() => true).catch(() => false)
}

export async function loadFreshResourcePackSnapshot(
  input: ResourcePackBuildInput,
): Promise<ResourcePackResolution | undefined> {
  const metadata = await loadResourcePackMetadata(input.packPaths.metadataPath)
  if (!metadata) return undefined
  if (metadata.source_path !== input.sourcePath) return undefined
  if (metadata.source_mtime_ms !== Number(input.sourceStat.mtimeMs)) return undefined
  if (metadata.source_size_bytes !== Number(input.sourceStat.size)) return undefined

  return {
    sourcePath: input.sourcePath,
    sourceRelpath: input.sourceRelpath,
    packKey: path.basename(input.packPaths.rootPath),
    packRootPath: input.packPaths.rootPath,
    metadataPath: input.packPaths.metadataPath,
    entrypointPath: input.packPaths.entrypointPath,
    fullPath: input.packPaths.fullPath,
    tocPath: (await exists(input.packPaths.tocPath)) ? input.packPaths.tocPath : undefined,
    status: metadata.status,
    format: metadata.format,
    warnings: metadata.warnings,
  }
}

export function createPendingResourcePackSnapshot(input: ResourcePackBuildInput): ResourcePackResolution {
  return {
    sourcePath: input.sourcePath,
    sourceRelpath: input.sourceRelpath,
    packKey: path.basename(input.packPaths.rootPath),
    packRootPath: input.packPaths.rootPath,
    metadataPath: input.packPaths.metadataPath,
    entrypointPath: input.packPaths.entrypointPath,
    fullPath: input.packPaths.fullPath,
    tocPath: undefined,
    status: RESOURCE_PACK_STATUS_PREPARING,
    format: input.classification.format,
    warnings: [RESOURCE_PACK_PREPARING_WARNING],
  }
}

export async function writePreparingResourcePackMetadata(input: {
  build: ResourcePackBuildInput
  warnings: string[]
}) {
  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    source_path: input.build.sourcePath,
    source_relpath: input.build.sourceRelpath,
    format: input.build.classification.format,
    status: RESOURCE_PACK_STATUS_PREPARING,
    extractor: "pending",
    prepared_at: new Date().toISOString(),
    source_mtime_ms: Number(input.build.sourceStat.mtimeMs),
    source_size_bytes: Number(input.build.sourceStat.size),
    chunk_count: 0,
    page_count: undefined,
    warnings: input.warnings,
  })
}

export async function writeResourcePackFiles(input: {
  build: ResourcePackBuildInput
  status: ResourcePackStatus
  warnings: string[]
  extractor: string
  fullText: string
  tocMarkdown?: string
  pageMarkdowns?: ResourceExtractionPage[]
  chunks: string[]
}) {
  await fs.mkdir(input.build.packPaths.chunksDirPath, { recursive: true })
  await writeTextFile(input.build.packPaths.fullPath, input.fullText)

  if (input.tocMarkdown && input.tocMarkdown.trim().length > 0) {
    await writeTextFile(input.build.packPaths.tocPath, input.tocMarkdown)
  } else {
    await fs.rm(input.build.packPaths.tocPath, { force: true }).catch(() => undefined)
  }

  await writePageMarkdowns(input.build.packPaths.pagesDirPath, input.pageMarkdowns)
  await writeChunkMarkdowns(input.build.packPaths.chunksDirPath, input.chunks)

  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    source_path: input.build.sourcePath,
    source_relpath: input.build.sourceRelpath,
    format: input.build.classification.format,
    status: input.status,
    extractor: input.extractor,
    prepared_at: new Date().toISOString(),
    source_mtime_ms: Number(input.build.sourceStat.mtimeMs),
    source_size_bytes: Number(input.build.sourceStat.size),
    chunk_count: input.chunks.length,
    page_count: input.pageMarkdowns?.length,
    warnings: input.warnings,
  })
}

export async function writeErroredResourcePackMetadata(input: {
  build: ResourcePackBuildInput
  message: string
}) {
  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    source_path: input.build.sourcePath,
    source_relpath: input.build.sourceRelpath,
    format: input.build.classification.format,
    status: RESOURCE_PACK_STATUS_ERROR,
    extractor: "error",
    prepared_at: new Date().toISOString(),
    source_mtime_ms: Number(input.build.sourceStat.mtimeMs),
    source_size_bytes: Number(input.build.sourceStat.size),
    chunk_count: 0,
    warnings: [input.message],
  })
}

async function loadResourcePackMetadata(metadataPath: string): Promise<ResourcePackMetadata | undefined> {
  const existing = await fs.readFile(metadataPath, "utf8").catch(() => undefined)
  if (!existing) return undefined

  const parsed = matter(existing)
  const data = isPlainObject(parsed.data) ? parsed.data : undefined
  if (!data) return undefined

  const sourcePath = stringValue(data, "source_path")
  const sourceRelpath = stringValue(data, "source_relpath")
  const format = normalizeResourceFormat(stringValue(data, "format"))
  const status = normalizeResourcePackStatus(stringValue(data, "status"))
  const extractor = stringValue(data, "extractor")
  const preparedAt = stringValue(data, "prepared_at")
  const sourceMtimeMs = numberValue(data, "source_mtime_ms")
  const sourceSizeBytes = numberValue(data, "source_size_bytes")
  const chunkCount = numberValue(data, "chunk_count")
  const warnings = stringArrayValue(data, "warnings")
  const pageCount = numberValue(data, "page_count", true)

  if (
    !sourcePath ||
    !sourceRelpath ||
    !format ||
    !status ||
    !extractor ||
    !preparedAt ||
    sourceMtimeMs === undefined ||
    sourceSizeBytes === undefined ||
    chunkCount === undefined
  ) {
    return undefined
  }

  return {
    source_path: sourcePath,
    source_relpath: sourceRelpath,
    format,
    status,
    extractor,
    prepared_at: preparedAt,
    source_mtime_ms: sourceMtimeMs,
    source_size_bytes: sourceSizeBytes,
    chunk_count: chunkCount,
    warnings,
    ...(pageCount !== undefined ? { page_count: pageCount } : {}),
  }
}

async function writeResourcePackMetadata(metadataPath: string, metadata: ResourcePackMetadata) {
  await writeTextFile(metadataPath, buildResourcePackEntryMarkdown(metadata))
}

async function writePageMarkdowns(pagesDirPath: string, pageMarkdowns?: ResourceExtractionPage[]) {
  if (!pageMarkdowns || pageMarkdowns.length === 0) {
    await fs.rm(pagesDirPath, { recursive: true, force: true }).catch(() => undefined)
    return
  }

  await fs.rm(pagesDirPath, { recursive: true, force: true }).catch(() => undefined)
  await fs.mkdir(pagesDirPath, { recursive: true })
  await Promise.all(
    pageMarkdowns.map(async (page) => {
      const filename = `${String(page.pageNumber).padStart(4, "0")}.md`
      await writeTextFile(path.join(pagesDirPath, filename), page.markdown)
    }),
  )
}

async function writeChunkMarkdowns(chunksDirPath: string, chunks: string[]) {
  await fs.rm(chunksDirPath, { recursive: true, force: true }).catch(() => undefined)
  await fs.mkdir(chunksDirPath, { recursive: true })

  await Promise.all(
    chunks.map(async (chunk, index) => {
      const filename = `${String(index + 1).padStart(4, "0")}.md`
      await writeTextFile(path.join(chunksDirPath, filename), wrapChunkMarkdown(index, chunk))
    }),
  )
}

async function writeTextFile(filepath: string, content: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  await fs.writeFile(filepath, content, "utf8")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : ""
}

function numberValue(record: Record<string, unknown>, key: string, optional = false) {
  const value = record[key]
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return optional ? undefined : 0
}

function stringArrayValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string")
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value]
  }
  return []
}

function normalizeResourcePackStatus(value: string) {
  if (value === RESOURCE_PACK_STATUS_PREPARING) return RESOURCE_PACK_STATUS_PREPARING
  if (value === RESOURCE_PACK_STATUS_READY) return RESOURCE_PACK_STATUS_READY
  if (value === RESOURCE_PACK_STATUS_UNSUPPORTED) return RESOURCE_PACK_STATUS_UNSUPPORTED
  if (value === RESOURCE_PACK_STATUS_ERROR) return RESOURCE_PACK_STATUS_ERROR
  return undefined
}

function normalizeResourceFormat(value: string): ResourceFormat | undefined {
  if (value === "pdf") return "pdf"
  if (value === "epub") return "epub"
  if (value === "docx") return "docx"
  if (value === "html") return "html"
  if (value === "htm") return "htm"
  if (value === "xhtml") return "xhtml"
  if (value === "markdown") return "markdown"
  if (value === "text") return "text"
  if (value === "json") return "json"
  if (value === "jsonc") return "jsonc"
  if (value === "yaml") return "yaml"
  if (value === "yml") return "yml"
  if (value === "csv") return "csv"
  if (value === "code") return "code"
  if (value === "unknown") return "unknown"
  return undefined
}
