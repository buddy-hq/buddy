import { describe, expect, test } from "bun:test"
import matter from "gray-matter"
import { buildResourceChunkFiles } from "../../src/resource-packs/chunking"
import {
  RESOURCE_PACK_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  estimateTokenCountFromText,
} from "../../src/resource-packs/chunking-config"
import {
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
  RESOURCE_PACK_SPLIT_REASON_INTACT,
  RESOURCE_PACK_UNIT_KIND_CHAPTER as CHAPTER_KIND,
  RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW as PAGE_WINDOW_KIND,
} from "../../src/resource-packs/contracts"

const ESTIMATOR_TEST_CHARACTER_COUNT = 400
const ASCII_ESTIMATOR_EXPECTED_TOKENS = 110
const TWO_BYTE_UNICODE_ESTIMATOR_EXPECTED_TOKENS = 440

describe("resource pack chunking", () => {
  test("estimates ASCII and non-ASCII UTF-8 text with a safety margin", () => {
    const asciiText = "a".repeat(ESTIMATOR_TEST_CHARACTER_COUNT)
    const twoByteUnicodeText = "ª".repeat(ESTIMATOR_TEST_CHARACTER_COUNT)

    expect(estimateTokenCountFromText(asciiText)).toBe(ASCII_ESTIMATOR_EXPECTED_TOKENS)
    expect(estimateTokenCountFromText(twoByteUnicodeText)).toBe(
      TWO_BYTE_UNICODE_ESTIMATOR_EXPECTED_TOKENS,
    )
  })

  test("marks top-level heading sections as intact structure", async () => {
    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "guide",
      sourceRelpath: "guide.md",
      format: "markdown",
      fullText: ["# Intro", "", "First section.", "", "# Details", "", "Second section."].join(
        "\n",
      ),
    })

    expect(chunkFiles).toHaveLength(2)
    for (const chunkFile of chunkFiles) {
      const parsed = matter(chunkFile.content)
      expect(parsed.data.split_reason).toBe(RESOURCE_PACK_SPLIT_REASON_INTACT)
    }
  })

  test("marks nested-heading fallback sections as fallback_structure", async () => {
    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "guide",
      sourceRelpath: "guide.md",
      format: "markdown",
      fullText: ["## Intro", "", "First section.", "", "## Details", "", "Second section."].join(
        "\n",
      ),
    })

    expect(chunkFiles).toHaveLength(2)
    for (const chunkFile of chunkFiles) {
      const parsed = matter(chunkFile.content)
      expect(parsed.data.split_reason).toBe(RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE)
    }
  })

  test("keeps split page-window chunk filenames unique", async () => {
    const repeatedText = "a".repeat(RESOURCE_PACK_NON_CHAPTER_MAX_CHARS * 2)

    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "guide",
      sourceRelpath: "guide.pdf",
      format: "pdf",
      fullText: repeatedText,
      chunkUnits: [
        {
          unitKind: PAGE_WINDOW_KIND,
          unitTitle: "Page 1",
          unitIndex: 1,
          pageStart: 1,
          pageEnd: 1,
          text: repeatedText,
        },
      ],
    })

    expect(chunkFiles).toHaveLength(2)
    expect(new Set(chunkFiles.map((file) => file.filename)).size).toBe(chunkFiles.length)
    expect(chunkFiles[0]?.filename).toContain("-part-001-of-002-")
    expect(chunkFiles[1]?.filename).toContain("-part-002-of-002-")
  })

  test("splits oversized EPUB chapters on heading boundaries before recursive fallback", async () => {
    const chapterBody = [
      "# Chapter One",
      "",
      "a".repeat(RESOURCE_PACK_CHAPTER_MAX_CHARS - 512),
      "",
      "## Appendix",
      "",
      "b".repeat(640),
    ].join("\n")

    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "manual",
      sourceRelpath: "manual.epub",
      format: "epub",
      fullText: chapterBody,
      chunkUnits: [
        {
          unitKind: CHAPTER_KIND,
          unitTitle: "Chapter One",
          unitIndex: 1,
          text: chapterBody,
        },
      ],
    })

    expect(chunkFiles).toHaveLength(2)
    const firstPart = matter(chunkFiles[0]!.content).content
    const secondPart = matter(chunkFiles[1]!.content).content
    expect(firstPart).not.toContain("## Appendix")
    expect(secondPart).toContain("## Appendix")
  })
})
