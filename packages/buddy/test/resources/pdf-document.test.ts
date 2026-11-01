import { expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { validateReaderSourcePath } from "../../src/resources/reader-source-validator"
import { createRecoverableBrokenXrefTextPdf } from "../helpers/pdf"
import { tmpdir } from "../helpers/tmpdir"

test("validates a recoverable PDF using the Bun validation worker", async () => {
  await using project = await tmpdir()
  const sourcePath = path.join(project.path, "recoverable.pdf")
  await writeFile(sourcePath, createRecoverableBrokenXrefTextPdf("Bun PDF recovery"), "utf8")

  expect(await validateReaderSourcePath(sourcePath)).toEqual({
    format: "pdf",
    sourceValidity: "valid",
    reason: null,
  })
})
