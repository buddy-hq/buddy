import { describe, expect, test } from "bun:test"
import {
  assertResourceArchiveBudget,
  assertResourceChunkUnitCount,
  assertResourceExtractionBudget,
  assertResourcePageCount,
  assertResourceSourceSize,
  assertResourceTextCharacterCount,
  RESOURCE_MAX_CHUNK_UNIT_COUNT,
  RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES,
  RESOURCE_MAX_FULL_TEXT_CHARACTERS,
  RESOURCE_MAX_PAGE_COUNT,
  RESOURCE_MAX_SOURCE_BYTES,
} from "../../src/resource-packs/budgets"
import { RESOURCE_PACK_STATUS_READY } from "../../src/resource-packs/contracts"

describe("resource preparation budgets", () => {
  test("rejects source files above the admission limit", () => {
    expect(() => assertResourceSourceSize(RESOURCE_MAX_SOURCE_BYTES)).not.toThrow()
    expect(() => assertResourceSourceSize(RESOURCE_MAX_SOURCE_BYTES + 1)).toThrow(
      "maximum supported size",
    )
  })

  test("rejects archives above the aggregate expansion limit", () => {
    const entryCount = 5
    const expandedBytesPerEntry = Math.ceil(RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES / (entryCount - 1))
    expect(() =>
      assertResourceArchiveBudget(
        Array.from({ length: entryCount }, (_, index) => ({
          filename: `chapter-${index}.xhtml`,
          compressedSize: 1,
          uncompressedSize: expandedBytesPerEntry,
        })),
      ),
    ).toThrow("aggregate limit")
  })

  test("rejects extracted text before chunk amplification", () => {
    expect(() =>
      assertResourceExtractionBudget({
        status: RESOURCE_PACK_STATUS_READY,
        warnings: [],
        extractor: "fixture",
        fullText: "a".repeat(RESOURCE_MAX_FULL_TEXT_CHARACTERS + 1),
      }),
    ).toThrow("maximum supported count")
  })

  test("rejects parser growth as soon as an extraction limit is crossed", () => {
    expect(() => assertResourceTextCharacterCount(RESOURCE_MAX_FULL_TEXT_CHARACTERS + 1)).toThrow(
      "maximum supported count",
    )
    expect(() => assertResourcePageCount(RESOURCE_MAX_PAGE_COUNT + 1)).toThrow(
      "maximum supported count",
    )
    expect(() => assertResourceChunkUnitCount(RESOURCE_MAX_CHUNK_UNIT_COUNT + 1)).toThrow(
      "maximum supported count",
    )
  })
})
