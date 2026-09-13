import { afterEach, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import {
  clearReaderSourceValidationCache,
  validateReaderSourcePath,
} from "../../src/resources/reader-source-validator"
import {
  createRecoverableBrokenXrefTextPdf,
  createRecoverablePdfWithoutEof,
  createRecoverablePdfWithoutStartXref,
} from "../helpers/pdf"
import { tmpdir } from "../helpers/tmpdir"

afterEach(() => {
  clearReaderSourceValidationCache()
})

const RECOVERABLE_PDF_CASES = [
  {
    name: "xref offset beyond the file",
    source: createRecoverableBrokenXrefTextPdf("Past EOF xref", 99_999_999),
  },
  {
    name: "missing startxref marker",
    source: createRecoverablePdfWithoutStartXref("Missing startxref"),
  },
  {
    name: "missing EOF marker",
    source: createRecoverablePdfWithoutEof("Missing EOF"),
  },
] as const

for (const fixture of RECOVERABLE_PDF_CASES) {
  test(`accepts a PDF.js-recoverable document with ${fixture.name}`, async () => {
    await using project = await tmpdir()
    const sourcePath = path.join(project.path, "recoverable.pdf")
    await writeFile(sourcePath, fixture.source, "utf8")

    await expect(validateReaderSourcePath(sourcePath)).resolves.toEqual({
      format: "pdf",
      sourceValidity: "valid",
      reason: null,
    })
  })
}
