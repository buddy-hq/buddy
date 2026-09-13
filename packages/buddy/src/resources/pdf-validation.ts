import { Worker } from "node:worker_threads"
import {
  parsePdfValidationWorkerOutput,
  PDF_VALIDATION_STATUS_ERROR,
  PDF_VALIDATION_STATUS_INVALID,
  PDF_VALIDATION_STATUS_VALID,
  PDF_VALIDATION_WORKER_BUNDLED_FILENAME,
  PDF_VALIDATION_WORKER_MAX_OLD_GENERATION_SIZE_MB,
  PDF_VALIDATION_WORKER_MAX_YOUNG_GENERATION_SIZE_MB,
  PDF_VALIDATION_WORKER_NAME,
  PDF_VALIDATION_WORKER_SOURCE_FILENAME,
  PDF_VALIDATION_WORKER_TIMEOUT_MS,
} from "./pdf-validation-worker-protocol"

const TYPESCRIPT_MODULE_SUFFIX = ".ts" as const

function pdfValidationWorkerUrl(): URL {
  const filename = import.meta.url.endsWith(TYPESCRIPT_MODULE_SUFFIX)
    ? PDF_VALIDATION_WORKER_SOURCE_FILENAME
    : PDF_VALIDATION_WORKER_BUNDLED_FILENAME
  return new URL(filename, import.meta.url)
}

function errorFromUnknown<TValue>(value: TValue): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function validatePdfDocumentInWorker(sourcePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(pdfValidationWorkerUrl(), {
        name: PDF_VALIDATION_WORKER_NAME,
        workerData: sourcePath,
        resourceLimits: {
          maxOldGenerationSizeMb: PDF_VALIDATION_WORKER_MAX_OLD_GENERATION_SIZE_MB,
          maxYoungGenerationSizeMb: PDF_VALIDATION_WORKER_MAX_YOUNG_GENERATION_SIZE_MB,
        },
      })
    } catch (error) {
      reject(errorFromUnknown(error))
      return
    }

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(new Error(`PDF validation worker timed out after ${PDF_VALIDATION_WORKER_TIMEOUT_MS} ms.`))
    }, PDF_VALIDATION_WORKER_TIMEOUT_MS)

    worker.once("message", (value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      void worker.terminate()
      const output = parsePdfValidationWorkerOutput(value)
      if (!output) {
        reject(new Error("PDF validation worker returned an invalid result."))
        return
      }
      switch (output.status) {
        case PDF_VALIDATION_STATUS_VALID:
          resolve(true)
          return
        case PDF_VALIDATION_STATUS_INVALID:
          resolve(false)
          return
        case PDF_VALIDATION_STATUS_ERROR:
          reject(new Error(`PDF validation worker failed: ${output.reason}`))
      }
    })
    worker.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    worker.once("exit", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`PDF validation worker exited before returning a result (code ${code}).`))
    })
  })
}
