import { PDF_VALIDATION_WORKER_BUNDLED_FILENAME } from "@buddy/script/backend-node-runtime"
import { parseTJsonObject, parseTNumber, parseTString } from "../resource-packs/json-value"

export { PDF_VALIDATION_WORKER_BUNDLED_FILENAME }

export const PDF_VALIDATION_WORKER_SOURCE_FILENAME = "pdf-validation-worker.ts" as const
export const PDF_VALIDATION_WORKER_NAME = "buddy-pdf-validation" as const
export const PDF_VALIDATION_WORKER_TIMEOUT_MS = 15_000
export const PDF_VALIDATION_WORKER_MAX_OLD_GENERATION_SIZE_MB = 192
export const PDF_VALIDATION_WORKER_MAX_YOUNG_GENERATION_SIZE_MB = 32

export const PDF_VALIDATION_STATUS_VALID = "valid" as const
export const PDF_VALIDATION_STATUS_INVALID = "invalid" as const
export const PDF_VALIDATION_STATUS_ERROR = "error" as const

export type PdfValidationWorkerOutput =
  | { status: typeof PDF_VALIDATION_STATUS_VALID; pageCount: number }
  | { status: typeof PDF_VALIDATION_STATUS_INVALID; reason: string }
  | { status: typeof PDF_VALIDATION_STATUS_ERROR; reason: string }

export function validPdfValidationWorkerOutput(pageCount: number): PdfValidationWorkerOutput {
  return { status: PDF_VALIDATION_STATUS_VALID, pageCount }
}

export function invalidPdfValidationWorkerOutput(reason: string): PdfValidationWorkerOutput {
  return { status: PDF_VALIDATION_STATUS_INVALID, reason }
}

export function failedPdfValidationWorkerOutput(reason: string): PdfValidationWorkerOutput {
  return { status: PDF_VALIDATION_STATUS_ERROR, reason }
}

export function parsePdfValidationWorkerOutput<TValue>(
  value: TValue,
): PdfValidationWorkerOutput | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const status = parseTString(record.status)
  if (status === PDF_VALIDATION_STATUS_VALID) {
    const pageCount = parseTNumber(record.pageCount)
    if (pageCount === undefined || !Number.isSafeInteger(pageCount) || pageCount <= 0) {
      return undefined
    }
    return { status: PDF_VALIDATION_STATUS_VALID, pageCount }
  }
  const reason = parseTString(record.reason)
  if (
    (status === PDF_VALIDATION_STATUS_INVALID || status === PDF_VALIDATION_STATUS_ERROR) &&
    reason !== undefined
  ) {
    return { status, reason }
  }
  return undefined
}
