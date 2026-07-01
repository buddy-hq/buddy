import { afterEach, describe, expect, test } from "bun:test"
import {
  PDF_EXTRACTION_MODE_ENV,
  PDF_EXTRACTION_MODE_LEGACY,
  PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR,
  PDF_EXTRACTION_MODE_LITEPARSE_OCR,
  PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR,
  resolvePdfExtractionMode,
} from "../../src/resource-packs/pdf/extraction-mode"

const originalMode = process.env[PDF_EXTRACTION_MODE_ENV]

afterEach(() => {
  if (originalMode === undefined) {
    delete process.env[PDF_EXTRACTION_MODE_ENV]
    return
  }
  process.env[PDF_EXTRACTION_MODE_ENV] = originalMode
})

describe("PDF extraction mode", () => {
  test("defaults to LiteParse with selective OCR", () => {
    delete process.env[PDF_EXTRACTION_MODE_ENV]
    expect(resolvePdfExtractionMode()).toBe(PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR)
  })

  test("supports benchmark extraction modes", () => {
    process.env[PDF_EXTRACTION_MODE_ENV] = PDF_EXTRACTION_MODE_LITEPARSE_OCR
    expect(resolvePdfExtractionMode()).toBe(PDF_EXTRACTION_MODE_LITEPARSE_OCR)

    process.env[PDF_EXTRACTION_MODE_ENV] = PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR
    expect(resolvePdfExtractionMode()).toBe(PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR)

    process.env[PDF_EXTRACTION_MODE_ENV] = PDF_EXTRACTION_MODE_LEGACY
    expect(resolvePdfExtractionMode()).toBe(PDF_EXTRACTION_MODE_LEGACY)
  })

  test("ignores unknown extraction modes", () => {
    process.env[PDF_EXTRACTION_MODE_ENV] = "unknown"
    expect(resolvePdfExtractionMode()).toBe(PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR)
  })
})
