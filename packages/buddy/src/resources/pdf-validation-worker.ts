import { parentPort, workerData } from "node:worker_threads"
import { parseTNonEmptyString } from "../resource-packs/json-value"
import { readPdfDocumentPageCount } from "./pdf-document"
import {
  failedPdfValidationWorkerOutput,
  invalidPdfValidationWorkerOutput,
  validPdfValidationWorkerOutput,
} from "./pdf-validation-worker-protocol"

const PDFJS_INVALID_DOCUMENT_ERROR_NAMES = new Set(["InvalidPDFException", "PasswordException"])

const sourcePath = parseTNonEmptyString(workerData)
if (sourcePath === undefined) {
  throw new Error("PDF validation worker received an invalid source path.")
}
if (!parentPort) {
  throw new Error("PDF validation worker requires a parent message port.")
}

try {
  const publishOutput = parentPort.postMessage.bind(parentPort)
  const pageCount = await readPdfDocumentPageCount(sourcePath)
  publishOutput(validPdfValidationWorkerOutput(pageCount))
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  const publishOutput = parentPort.postMessage.bind(parentPort)
  publishOutput(
    error instanceof Error && PDFJS_INVALID_DOCUMENT_ERROR_NAMES.has(error.name)
      ? invalidPdfValidationWorkerOutput(reason)
      : failedPdfValidationWorkerOutput(reason),
  )
} finally {
  parentPort.close()
}
