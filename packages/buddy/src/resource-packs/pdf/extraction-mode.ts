export const PDF_EXTRACTION_MODE_ENV = "BUDDY_PDF_EXTRACTION_MODE" as const

export const PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR = "liteparse-selective-ocr" as const
export const PDF_EXTRACTION_MODE_LITEPARSE_OCR = "liteparse-ocr" as const
export const PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR = "liteparse-no-ocr" as const
export const PDF_EXTRACTION_MODE_LEGACY = "legacy" as const

export type PdfExtractionMode =
  | typeof PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR
  | typeof PDF_EXTRACTION_MODE_LITEPARSE_OCR
  | typeof PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR
  | typeof PDF_EXTRACTION_MODE_LEGACY

export function resolvePdfExtractionMode(): PdfExtractionMode {
  const configuredMode = process.env[PDF_EXTRACTION_MODE_ENV]?.trim()
  if (configuredMode === PDF_EXTRACTION_MODE_LITEPARSE_OCR) {
    return configuredMode
  }
  if (configuredMode === PDF_EXTRACTION_MODE_LITEPARSE_NO_OCR) {
    return configuredMode
  }
  if (configuredMode === PDF_EXTRACTION_MODE_LEGACY) {
    return configuredMode
  }
  return PDF_EXTRACTION_MODE_LITEPARSE_SELECTIVE_OCR
}
