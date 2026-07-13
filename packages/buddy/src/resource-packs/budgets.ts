import type { ResourceExtractionResult } from "./contracts"

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

type ResourceArchiveEntry = {
  filename: string
  compressedSize: number
  uncompressedSize: number
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

export function assertResourceArchiveBudget(entries: ResourceArchiveEntry[]): void {
  if (entries.length > RESOURCE_MAX_ARCHIVE_ENTRY_COUNT) {
    throw new ResourceBudgetExceededError(
      `Resource archive contains ${entries.length} entries; the maximum supported count is ${RESOURCE_MAX_ARCHIVE_ENTRY_COUNT}.`,
    )
  }

  let expandedBytes = 0
  for (const entry of entries) {
    if (entry.uncompressedSize > RESOURCE_MAX_ARCHIVE_ENTRY_BYTES) {
      throw new ResourceBudgetExceededError(
        `Resource archive entry ${entry.filename} expands to ${formatMebibytes(entry.uncompressedSize)}; the per-entry maximum is ${formatMebibytes(RESOURCE_MAX_ARCHIVE_ENTRY_BYTES)}.`,
      )
    }

    expandedBytes += entry.uncompressedSize
    if (expandedBytes > RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES) {
      throw new ResourceBudgetExceededError(
        `Resource archive expands beyond the ${formatMebibytes(RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES)} aggregate limit.`,
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
}
