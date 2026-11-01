import { Worker, type WorkerOptions } from "node:worker_threads"
import { isCompiledBackend } from "../compiled-backend"
import {
  parsePdfValidationWorkerOutput,
  PDF_VALIDATION_STATUS_ERROR,
  PDF_VALIDATION_STATUS_INVALID,
  PDF_VALIDATION_STATUS_VALID,
  PDF_VALIDATION_WORKER_NAME,
  PDF_VALIDATION_WORKER_TIMEOUT_MS,
} from "./pdf-validation-worker-protocol"

function pdfValidationWorkerUrl(): URL {
  if (isCompiledBackend) return new URL("./pdf-validation-worker.js", import.meta.url)
  return new URL("./pdf-validation-worker.ts", import.meta.url)
}

function errorFromUnknown<TValue>(value: TValue): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function validatePdfDocumentInWorker(sourcePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      const options = {
        name: PDF_VALIDATION_WORKER_NAME,
        workerData: sourcePath,
        smol: true,
      } satisfies WorkerOptions & Bun.WorkerOptions
      worker = new Worker(pdfValidationWorkerUrl(), options)
    } catch (error) {
      reject(errorFromUnknown(error))
      return
    }

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(
        new Error(`PDF validation worker timed out after ${PDF_VALIDATION_WORKER_TIMEOUT_MS} ms.`),
      )
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
