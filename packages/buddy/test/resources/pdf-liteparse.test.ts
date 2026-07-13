import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  extractPdfResourceWithMetadataExtractorForTests,
  extractResourcePack,
} from "../../src/resource-packs/extractors"
import { resolveLiteParseTessdataDirectory } from "../../src/resource-packs/pdf/liteparse-parser"
import type { ResourceClassification } from "../../src/resource-packs/contracts"
import { createTextPdf } from "../helpers/pdf"

const TEST_PDF_TEXT = "Buddy LiteParse default extraction"
const TEST_PDF_FILENAME = "liteparse-default.pdf" as const
const LITEPARSE_INTEGRATION_TEST_TIMEOUT_MS = 30_000
const PDF_CLASSIFICATION = {
  kind: "pack",
  format: "pdf",
  mime: "application/pdf",
} satisfies ResourceClassification

let temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  )
  temporaryDirectories = []
})

describe("PDF LiteParse extraction", () => {
  test("resolves Buddy-packaged English tessdata", async () => {
    const directory = await resolveLiteParseTessdataDirectory()
    expect(path.basename(directory)).toBe("tessdata")
  })

  test(
    "uses LiteParse as the default PDF engine",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-liteparse-test-"))
      temporaryDirectories.push(directory)
      const sourcePath = path.join(directory, TEST_PDF_FILENAME)
      await writeFile(sourcePath, createTextPdf(TEST_PDF_TEXT), "binary")

      const result = await extractResourcePack(sourcePath, PDF_CLASSIFICATION)

      expect(result.status).toBe("ready")
      expect(result.extractor).toBe("@llamaindex/liteparse")
      expect(result.fullText).toContain(TEST_PDF_TEXT)
      expect(result.pageMarkdowns).toHaveLength(1)
    },
    LITEPARSE_INTEGRATION_TEST_TIMEOUT_MS,
  )

  test(
    "still uses LiteParse when PDF outline metadata extraction fails",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-liteparse-test-"))
      temporaryDirectories.push(directory)
      const sourcePath = path.join(directory, TEST_PDF_FILENAME)
      await writeFile(sourcePath, createTextPdf(TEST_PDF_TEXT), "binary")

      const result = await extractPdfResourceWithMetadataExtractorForTests(
        sourcePath,
        async () => {
          throw new Error("metadata parser failed")
        },
      )

      expect(result.status).toBe("ready")
      expect(result.extractor).toBe("@llamaindex/liteparse")
      expect(result.fullText).toContain(TEST_PDF_TEXT)
      expect(result.warnings).toContain("PDF outline extraction failed: metadata parser failed")
    },
    LITEPARSE_INTEGRATION_TEST_TIMEOUT_MS,
  )
})
