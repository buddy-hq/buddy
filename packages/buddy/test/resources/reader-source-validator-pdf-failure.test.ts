import { afterEach, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import {
  clearReaderSourceValidationCache,
  validateReaderSourcePath,
} from "../../src/resources/reader-source-validator"
import { createRecoverablePdfWithoutEof } from "../helpers/pdf"
import { tmpdir } from "../helpers/tmpdir"

const INJECTED_PDF_PARSER_FAILURE = "injected PDF parser failure"

mock.module("node:worker_threads", () => {
  class Worker extends EventEmitter {
    constructor(_filename: URL | string) {
      super()
      queueMicrotask(() => {
        this.emit("message", {
          status: "error",
          reason: INJECTED_PDF_PARSER_FAILURE,
        })
      })
    }

    terminate() {
      return Promise.resolve(1)
    }
  }

  return { Worker }
})

afterEach(() => {
  clearReaderSourceValidationCache()
})

test("fails closed when PDF recovery reports a generic worker parser failure", async () => {
  await using project = await tmpdir()
  const sourcePath = path.join(project.path, "recoverable.pdf")
  await writeFile(sourcePath, createRecoverablePdfWithoutEof("Worker parser failure"), "utf8")

  const validation = await validateReaderSourcePath(sourcePath)
  expect(validation.format).toBe("pdf")
  expect(validation.sourceValidity).toBe("invalid")
  expect(validation.reason).toContain(INJECTED_PDF_PARSER_FAILURE)
})
