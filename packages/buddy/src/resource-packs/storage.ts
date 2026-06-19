import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { buildResourcePackEntryMarkdown } from "./markdown"
import type {
  ResourceChunkFileRecord,
  ResourceExtractionCover,
  ResourceExtractionPage,
  ResourceFormat,
  ResourcePackBuildInput,
  ResourcePackMetadata,
  ResourcePackResolution,
  ResourcePackStatus,
} from "./contracts"
import {
  RESOURCE_PACK_COVER_DEFAULT_EXTENSION,
  RESOURCE_PACK_COVER_FILE_PREFIX,
  RESOURCE_PACK_FILE_KIND_FULL_TEXT,
  RESOURCE_PACK_FILE_KIND_PAGE,
  RESOURCE_PACK_FILE_KIND_TOC,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_STATUS_ERROR,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_PREPARING_WARNING,
} from "./contracts"
import {
  RESOURCE_PACK_FILENAME_CHAR_LABEL,
  RESOURCE_PACK_FILENAME_CHAR_PAD,
  RESOURCE_PACK_FILENAME_PAGE_PAD,
  RESOURCE_PACK_FILENAME_TOKEN_LABEL,
  RESOURCE_PACK_FILENAME_TOKEN_PAD,
  RESOURCE_PACK_PAGE_FILE_PREFIX,
  estimateTokenCountFromText,
} from "./chunking-config"
import { resourceSourceSnapshotMatches } from "./source-match"

const COVER_MEDIA_TYPE_JPEG = "image/jpeg" as const
const COVER_MEDIA_TYPE_PNG = "image/png" as const
const COVER_MEDIA_TYPE_GIF = "image/gif" as const
const COVER_MEDIA_TYPE_WEBP = "image/webp" as const
const COVER_MEDIA_TYPE_SVG = "image/svg+xml" as const
const COVER_FILE_EXTENSION_JPEG = "jpg" as const
const COVER_FILE_EXTENSION_PNG = "png" as const
const COVER_FILE_EXTENSION_GIF = "gif" as const
const COVER_FILE_EXTENSION_WEBP = "webp" as const
const COVER_FILE_EXTENSION_SVG = "svg" as const
const COVER_FILE_SEPARATOR = "." as const

export async function exists(filepath: string) {
  return fs
    .stat(filepath)
    .then(() => true)
    .catch(() => false)
}

export async function loadFreshResourcePackSnapshot(
  input: ResourcePackBuildInput,
): Promise<ResourcePackResolution | undefined> {
  const metadata = await loadResourcePackMetadata(input.packPaths.metadataPath)
  if (!metadata) return undefined
  const sourceMtimeMs = Number(input.sourceStat.mtimeMs)
  const sourceSizeBytes = Number(input.sourceStat.size)
  if (
    !resourceSourceSnapshotMatches({
      metadataSourcePath: metadata.source_path,
      metadataSourceRelpath: metadata.source_relpath,
      metadataSourceMtimeMs: metadata.source_mtime_ms,
      metadataSourceSizeBytes: metadata.source_size_bytes,
      sourcePath: input.sourcePath,
      sourceRelpath: input.sourceRelpath,
      sourceMtimeMs,
      sourceSizeBytes,
    })
  ) {
    return undefined
  }

  const fullTextPath = await resolveFullTextPath({
    rootPath: input.packPaths.rootPath,
    metadataFullTextFile: metadata.full_text_file,
    fallbackPath: input.packPaths.fullPath,
  })

  return {
    sourcePath: input.sourcePath,
    sourceRelpath: input.sourceRelpath,
    packRootPath: input.packPaths.rootPath,
    metadataPath: input.packPaths.metadataPath,
    entrypointPath: input.packPaths.entrypointPath,
    fullPath: fullTextPath,
    tocPath: (await exists(input.packPaths.tocPath)) ? input.packPaths.tocPath : undefined,
    status: metadata.status,
    format: metadata.format,
    warnings: metadata.warnings,
  }
}

export function createPendingResourcePackSnapshot(
  input: ResourcePackBuildInput,
): ResourcePackResolution {
  return {
    sourcePath: input.sourcePath,
    sourceRelpath: input.sourceRelpath,
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
  const resourceAlias = resourceAliasForBuild(input.build)
  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    ...(input.build.objectID ? { object_id: input.build.objectID } : {}),
    resource_alias: resourceAlias,
    alias_at_build: resourceAlias,
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
    cover_relpath: undefined,
    title: undefined,
    author: undefined,
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
  chunkFiles: ResourceChunkFileRecord[]
  coverImage?: ResourceExtractionCover
  title?: string
  author?: string
}) {
  await fs.mkdir(input.build.packPaths.chunksDirPath, { recursive: true })
  const resourceAlias = resourceAliasForBuild(input.build)
  const fullTextBody = normalizeText(input.fullText)
  const fullTextChars = fullTextBody.length
  const fullTextTokens = estimateTokenCountFromText(fullTextBody)
  const fullTextFilename = buildFullTextFilename({
    estTokens: fullTextTokens,
    chars: fullTextChars,
  })
  const fullTextPath = path.join(input.build.packPaths.rootPath, fullTextFilename)
  await removeStaleFullTextFiles({
    rootPath: input.build.packPaths.rootPath,
    keepFilename: fullTextFilename,
  })
  await writeTextFile(
    fullTextPath,
    matter.stringify(fullTextBody, {
      file_kind: RESOURCE_PACK_FILE_KIND_FULL_TEXT,
      ...(input.build.objectID ? { object_id: input.build.objectID } : {}),
      resource_alias: resourceAlias,
      alias_at_build: resourceAlias,
      source_relpath: input.build.sourceRelpath,
      format: input.build.classification.format,
      chars: fullTextChars,
      est_tokens: fullTextTokens,
    }),
  )
  if (input.build.packPaths.fullPath !== fullTextPath) {
    await fs.rm(input.build.packPaths.fullPath, { force: true }).catch(() => undefined)
  }

  if (input.tocMarkdown && input.tocMarkdown.trim().length > 0) {
    await writeTextFile(
      input.build.packPaths.tocPath,
      matter.stringify(normalizeText(input.tocMarkdown), {
        file_kind: RESOURCE_PACK_FILE_KIND_TOC,
        ...(input.build.objectID ? { object_id: input.build.objectID } : {}),
        resource_alias: resourceAlias,
        alias_at_build: resourceAlias,
        source_relpath: input.build.sourceRelpath,
        format: input.build.classification.format,
      }),
    )
  } else {
    await fs.rm(input.build.packPaths.tocPath, { force: true }).catch(() => undefined)
  }

  await writePageMarkdowns({
    pagesDirPath: input.build.packPaths.pagesDirPath,
    pageMarkdowns: input.pageMarkdowns,
    resourceAlias,
    sourceRelpath: input.build.sourceRelpath,
    format: input.build.classification.format,
  })
  await writeChunkMarkdowns(input.build.packPaths.chunksDirPath, input.chunkFiles)

  const coverPath = await writeCoverFile({
    rootPath: input.build.packPaths.rootPath,
    coverImage: input.status !== RESOURCE_PACK_STATUS_UNSUPPORTED ? input.coverImage : undefined,
  })

  const coverRelpath = coverPath ? path.relative(input.build.directory, coverPath) : undefined

  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    ...(input.build.objectID ? { object_id: input.build.objectID } : {}),
    resource_alias: resourceAlias,
    alias_at_build: resourceAlias,
    source_path: input.build.sourcePath,
    source_relpath: input.build.sourceRelpath,
    format: input.build.classification.format,
    status: input.status,
    extractor: input.extractor,
    prepared_at: new Date().toISOString(),
    source_mtime_ms: Number(input.build.sourceStat.mtimeMs),
    source_size_bytes: Number(input.build.sourceStat.size),
    chunk_count: input.chunkFiles.length,
    full_text_file: fullTextFilename,
    page_count: input.pageMarkdowns?.length,
    warnings: input.warnings,
    cover_relpath: coverRelpath,
    title: input.title,
    author: input.author,
  })
}

export async function writeErroredResourcePackMetadata(input: {
  build: ResourcePackBuildInput
  message: string
}) {
  const resourceAlias = resourceAliasForBuild(input.build)
  await writeResourcePackMetadata(input.build.packPaths.metadataPath, {
    ...(input.build.objectID ? { object_id: input.build.objectID } : {}),
    resource_alias: resourceAlias,
    alias_at_build: resourceAlias,
    source_path: input.build.sourcePath,
    source_relpath: input.build.sourceRelpath,
    format: input.build.classification.format,
    status: RESOURCE_PACK_STATUS_ERROR,
    extractor: "error",
    prepared_at: new Date().toISOString(),
    source_mtime_ms: Number(input.build.sourceStat.mtimeMs),
    source_size_bytes: Number(input.build.sourceStat.size),
    chunk_count: 0,
    full_text_file: undefined,
    warnings: [input.message],
    cover_relpath: undefined,
    title: undefined,
    author: undefined,
  })
}

async function loadResourcePackMetadata(
  metadataPath: string,
): Promise<ResourcePackMetadata | undefined> {
  const existing = await fs.readFile(metadataPath, "utf8").catch(() => undefined)
  if (!existing) return undefined

  const parsed = matter(existing)
  const data = isPlainObject(parsed.data) ? parsed.data : undefined
  if (!data) return undefined

  const sourcePath = stringValue(data, "source_path")
  const sourceRelpath = stringValue(data, "source_relpath")
  const resourceAlias = stringValue(data, "resource_alias") || undefined
  const objectID = stringValue(data, "object_id") || undefined
  const aliasAtBuild = stringValue(data, "alias_at_build") || undefined
  const format = normalizeResourceFormat(stringValue(data, "format"))
  const status = normalizeResourcePackStatus(stringValue(data, "status"))
  const extractor = stringValue(data, "extractor")
  const preparedAt = stringValue(data, "prepared_at")
  const sourceMtimeMs = numberValue(data, "source_mtime_ms")
  const sourceSizeBytes = numberValue(data, "source_size_bytes")
  const chunkCount = numberValue(data, "chunk_count")
  const fullTextFile = stringValue(data, "full_text_file") || undefined
  const warnings = stringArrayValue(data, "warnings")
  const pageCount = numberValue(data, "page_count", true)
  const coverRelpath = stringValue(data, "cover_relpath") || undefined
  const title = stringValue(data, "title") || undefined
  const author = stringValue(data, "author") || undefined

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
    ...(objectID ? { object_id: objectID } : {}),
    resource_alias: resourceAlias,
    ...(aliasAtBuild ? { alias_at_build: aliasAtBuild } : {}),
    source_path: sourcePath,
    source_relpath: sourceRelpath,
    format,
    status,
    extractor,
    prepared_at: preparedAt,
    source_mtime_ms: sourceMtimeMs,
    source_size_bytes: sourceSizeBytes,
    chunk_count: chunkCount,
    full_text_file: fullTextFile,
    warnings,
    ...(pageCount !== undefined ? { page_count: pageCount } : {}),
    ...(coverRelpath ? { cover_relpath: coverRelpath } : {}),
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
  }
}

async function writeResourcePackMetadata(metadataPath: string, metadata: ResourcePackMetadata) {
  await writeTextFile(metadataPath, buildResourcePackEntryMarkdown(metadata))
}

async function writePageMarkdowns(input: {
  pagesDirPath: string
  pageMarkdowns?: ResourceExtractionPage[]
  resourceAlias: string
  sourceRelpath: string
  format: ResourceFormat
}) {
  const pagesDirPath = input.pagesDirPath
  const pageMarkdowns = input.pageMarkdowns
  if (!pageMarkdowns || pageMarkdowns.length === 0) {
    await fs.rm(pagesDirPath, { recursive: true, force: true }).catch(() => undefined)
    return
  }

  await fs.rm(pagesDirPath, { recursive: true, force: true }).catch(() => undefined)
  await fs.mkdir(pagesDirPath, { recursive: true })
  await Promise.all(
    pageMarkdowns.map(async (page) => {
      const pageBody = normalizeText(page.markdown)
      const chars = pageBody.length
      const estTokens = estimateTokenCountFromText(pageBody)
      const filename =
        [
          RESOURCE_PACK_PAGE_FILE_PREFIX,
          padNumber(page.pageNumber, RESOURCE_PACK_FILENAME_PAGE_PAD),
          RESOURCE_PACK_FILENAME_TOKEN_LABEL,
          padNumber(estTokens, RESOURCE_PACK_FILENAME_TOKEN_PAD),
          RESOURCE_PACK_FILENAME_CHAR_LABEL,
          padNumber(chars, RESOURCE_PACK_FILENAME_CHAR_PAD),
        ].join("-") + ".md"
      const content = matter.stringify(pageBody, {
        file_kind: RESOURCE_PACK_FILE_KIND_PAGE,
        resource_alias: input.resourceAlias,
        source_relpath: input.sourceRelpath,
        format: input.format,
        page_number: page.pageNumber,
        chars,
        est_tokens: estTokens,
      })
      await writeTextFile(path.join(pagesDirPath, filename), content)
    }),
  )
}

function resourceAliasForBuild(build: ResourcePackBuildInput): string {
  return build.resourceAlias ?? path.basename(path.dirname(build.packPaths.rootPath))
}

async function writeChunkMarkdowns(chunksDirPath: string, chunkFiles: ResourceChunkFileRecord[]) {
  await fs.rm(chunksDirPath, { recursive: true, force: true }).catch(() => undefined)
  await fs.mkdir(chunksDirPath, { recursive: true })

  await Promise.all(
    chunkFiles.map(async (chunkFile) => {
      await writeTextFile(
        path.join(chunksDirPath, chunkFile.filename),
        normalizeText(chunkFile.content),
      )
    }),
  )
}

async function writeTextFile(filepath: string, content: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  await fs.writeFile(filepath, content, "utf8")
}

async function writeCoverFile(input: {
  rootPath: string
  coverImage?: ResourceExtractionCover
}): Promise<string | undefined> {
  const coverFilename = input.coverImage
    ? buildCoverFilenameForMediaType(input.coverImage.mediaType)
    : undefined

  await removeStaleCoverFiles({
    rootPath: input.rootPath,
    keepFilename: coverFilename,
  })

  if (!input.coverImage || !coverFilename) return undefined
  const coverPath = path.join(input.rootPath, coverFilename)
  await writeBinaryFile(coverPath, input.coverImage.data)
  return coverPath
}

async function removeStaleCoverFiles(input: { rootPath: string; keepFilename?: string }) {
  const entries = await fs.readdir(input.rootPath, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return
      if (!isCoverFilename(entry.name)) return
      if (input.keepFilename && entry.name === input.keepFilename) return
      await fs.rm(path.join(input.rootPath, entry.name), { force: true }).catch(() => undefined)
    }),
  )
}

function isCoverFilename(filename: string) {
  return filename.startsWith(`${RESOURCE_PACK_COVER_FILE_PREFIX}${COVER_FILE_SEPARATOR}`)
}

function buildCoverFilenameForMediaType(mediaType: string) {
  const extension = coverFileExtensionForMediaType(mediaType)
  return `${RESOURCE_PACK_COVER_FILE_PREFIX}${COVER_FILE_SEPARATOR}${extension}`
}

function coverFileExtensionForMediaType(mediaType: string) {
  if (mediaType === COVER_MEDIA_TYPE_JPEG) return COVER_FILE_EXTENSION_JPEG
  if (mediaType === COVER_MEDIA_TYPE_PNG) return COVER_FILE_EXTENSION_PNG
  if (mediaType === COVER_MEDIA_TYPE_GIF) return COVER_FILE_EXTENSION_GIF
  if (mediaType === COVER_MEDIA_TYPE_WEBP) return COVER_FILE_EXTENSION_WEBP
  if (mediaType === COVER_MEDIA_TYPE_SVG) return COVER_FILE_EXTENSION_SVG
  return RESOURCE_PACK_COVER_DEFAULT_EXTENSION
}

async function writeBinaryFile(filepath: string, data: Buffer) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  await fs.writeFile(filepath, data)
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

function padNumber(value: number, width: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(width, "0")
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function buildFullTextFilename(input: { estTokens: number; chars: number }) {
  return (
    [
      RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
      RESOURCE_PACK_FILENAME_TOKEN_LABEL,
      padNumber(input.estTokens, RESOURCE_PACK_FILENAME_TOKEN_PAD),
      RESOURCE_PACK_FILENAME_CHAR_LABEL,
      padNumber(input.chars, RESOURCE_PACK_FILENAME_CHAR_PAD),
    ].join("-") + ".md"
  )
}

async function resolveFullTextPath(input: {
  rootPath: string
  metadataFullTextFile?: string
  fallbackPath: string
}) {
  const fromMetadata = input.metadataFullTextFile?.trim()
  if (fromMetadata) {
    const candidate = path.join(input.rootPath, fromMetadata)
    if (await exists(candidate)) return candidate
  }

  const entries = await fs.readdir(input.rootPath, { withFileTypes: true }).catch(() => [])
  const dynamic = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find(
      (name) =>
        name.startsWith(
          `${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-${RESOURCE_PACK_FILENAME_TOKEN_LABEL}-`,
        ) && name.endsWith(".md"),
    )
  if (dynamic) {
    return path.join(input.rootPath, dynamic)
  }

  if (await exists(input.fallbackPath)) return input.fallbackPath

  return path.join(input.rootPath, RESOURCE_PACK_FULL_TEXT_FILE_NAME)
}

async function removeStaleFullTextFiles(input: { rootPath: string; keepFilename: string }) {
  const entries = await fs.readdir(input.rootPath, { withFileTypes: true }).catch(() => [])
  const staleFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name !== input.keepFilename)
    .filter(
      (name) =>
        name === RESOURCE_PACK_FULL_TEXT_FILE_NAME ||
        (name.startsWith(
          `${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-${RESOURCE_PACK_FILENAME_TOKEN_LABEL}-`,
        ) &&
          name.endsWith(".md")),
    )

  await Promise.all(
    staleFiles.map((name) =>
      fs.rm(path.join(input.rootPath, name), { force: true }).catch(() => undefined),
    ),
  )
}
