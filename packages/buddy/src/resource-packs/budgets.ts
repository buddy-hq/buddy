import type { ResourceExtractionResult } from "./contracts"
import path from "node:path"

const MEBIBYTE_BYTES = 1024 * 1024
const UTF8_MAX_BYTES_PER_UTF16_CODE_UNIT = 3

export const RESOURCE_MAX_SOURCE_BYTES = 64 * MEBIBYTE_BYTES
export const RESOURCE_MAX_ARCHIVE_ENTRY_COUNT = 4_096
export const RESOURCE_MAX_ARCHIVE_ENTRY_BYTES = 32 * MEBIBYTE_BYTES
export const RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES = 128 * MEBIBYTE_BYTES
export const RESOURCE_MAX_FULL_TEXT_CHARACTERS = 16_000_000
export const RESOURCE_MAX_FULL_TEXT_UTF8_BYTES =
  RESOURCE_MAX_FULL_TEXT_CHARACTERS * UTF8_MAX_BYTES_PER_UTF16_CODE_UNIT
export const RESOURCE_MAX_PAGE_COUNT = 5_000
export const RESOURCE_MAX_CHUNK_UNIT_COUNT = 10_000
export const RESOURCE_MAX_TEXT_ARTIFACT_COUNT = 256
export const RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS = 32_000_000
export const RESOURCE_MAX_TEXT_ARTIFACT_PATH_CHARACTERS = 240

export type ResourceArchiveEntry = {
  filename: string
  compressedSize: number
  uncompressedSize: number
}

export type ResourceArchiveBudget = {
  maxEntryCount: number
  maxEntryBytes: number
  maxExpandedBytes: number
}

export const RESOURCE_DEFAULT_ARCHIVE_BUDGET: ResourceArchiveBudget = {
  maxEntryCount: RESOURCE_MAX_ARCHIVE_ENTRY_COUNT,
  maxEntryBytes: RESOURCE_MAX_ARCHIVE_ENTRY_BYTES,
  maxExpandedBytes: RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES,
}

export class ResourceBudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ResourceBudgetExceededError"
  }
}

function formatMebibytes(bytes: number): string {
  return `${Math.ceil(bytes / MEBIBYTE_BYTES)} MiB`
}

export function assertResourceSourceSize(sizeBytes: number): void {
  if (sizeBytes <= RESOURCE_MAX_SOURCE_BYTES) return

  throw new ResourceBudgetExceededError(
    `Resource source is ${formatMebibytes(sizeBytes)}; the maximum supported size is ${formatMebibytes(RESOURCE_MAX_SOURCE_BYTES)}. Split the resource into smaller files and import them separately.`,
  )
}

export function assertResourceArchiveBudget(
  entries: ResourceArchiveEntry[],
  budget: ResourceArchiveBudget = RESOURCE_DEFAULT_ARCHIVE_BUDGET,
): void {
  if (entries.length > budget.maxEntryCount) {
    throw new ResourceBudgetExceededError(
      `Resource archive contains ${entries.length} entries; the maximum supported count is ${budget.maxEntryCount}.`,
    )
  }

  let expandedBytes = 0
  for (const entry of entries) {
    if (entry.uncompressedSize > budget.maxEntryBytes) {
      throw new ResourceBudgetExceededError(
        `Resource archive entry ${entry.filename} expands to ${formatMebibytes(entry.uncompressedSize)}; the per-entry maximum is ${formatMebibytes(budget.maxEntryBytes)}.`,
      )
    }

    expandedBytes += entry.uncompressedSize
    if (expandedBytes > budget.maxExpandedBytes) {
      throw new ResourceBudgetExceededError(
        `Resource archive expands beyond the ${formatMebibytes(budget.maxExpandedBytes)} aggregate limit.`,
      )
    }
  }
}

export function assertResourceTextCharacterCount(characterCount: number): void {
  if (characterCount <= RESOURCE_MAX_FULL_TEXT_CHARACTERS) return
  throw new ResourceBudgetExceededError(
    `Extracted resource text contains ${characterCount} characters; the maximum supported count is ${RESOURCE_MAX_FULL_TEXT_CHARACTERS}.`,
  )
}

export function assertResourcePageCount(pageCount: number): void {
  if (pageCount <= RESOURCE_MAX_PAGE_COUNT) return
  throw new ResourceBudgetExceededError(
    `Resource extraction produced ${pageCount} pages; the maximum supported count is ${RESOURCE_MAX_PAGE_COUNT}.`,
  )
}

export function assertResourceChunkUnitCount(chunkUnitCount: number): void {
  if (chunkUnitCount <= RESOURCE_MAX_CHUNK_UNIT_COUNT) return
  throw new ResourceBudgetExceededError(
    `Resource extraction produced ${chunkUnitCount} chunk units; the maximum supported count is ${RESOURCE_MAX_CHUNK_UNIT_COUNT}.`,
  )
}

export function assertResourceExtractionBudget(extraction: ResourceExtractionResult): void {
  assertResourceTextCharacterCount(extraction.fullText.length)

  const pageCount = extraction.pageMarkdowns?.length ?? 0
  assertResourcePageCount(pageCount)

  const chunkUnitCount = extraction.chunkUnits?.length ?? extraction.chunkMarkdowns?.length ?? 0
  assertResourceChunkUnitCount(chunkUnitCount)

  const artifacts = extraction.textArtifacts ?? []
  if (artifacts.length > RESOURCE_MAX_TEXT_ARTIFACT_COUNT) {
    throw new ResourceBudgetExceededError(
      `Resource extraction produced ${artifacts.length} text artifacts; the maximum supported count is ${RESOURCE_MAX_TEXT_ARTIFACT_COUNT}.`,
    )
  }
  const artifactPaths = new Set<string>()
  let artifactCharacters = 0
  for (const artifact of artifacts) {
    const normalizedPath = path.posix.normalize(artifact.relativePath.replaceAll("\\", "/"))
    if (
      normalizedPath.length === 0 ||
      normalizedPath.length > RESOURCE_MAX_TEXT_ARTIFACT_PATH_CHARACTERS ||
      normalizedPath.startsWith("../") ||
      normalizedPath === ".." ||
      path.posix.isAbsolute(normalizedPath) ||
      normalizedPath !== artifact.relativePath.replaceAll("\\", "/")
    ) {
      throw new ResourceBudgetExceededError(
        `Resource text artifact path is invalid: ${artifact.relativePath}`,
      )
    }
    if (artifactPaths.has(normalizedPath)) {
      throw new ResourceBudgetExceededError(
        `Resource extraction produced a duplicate text artifact path: ${normalizedPath}`,
      )
    }
    artifactPaths.add(normalizedPath)
    artifactCharacters += artifact.content.length
    if (artifactCharacters > RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS) {
      throw new ResourceBudgetExceededError(
        `Resource text artifacts exceed the ${RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS} character limit.`,
      )
    }
  }
}
