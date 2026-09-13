import { expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveElectronBin } from "../../../desktop-electron/scripts/electron-bin"
import { createRecoverableBrokenXrefTextPdf } from "../helpers/pdf"
import { tmpdir } from "../helpers/tmpdir"

const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE" as const
const DESKTOP_PACKAGE_DIRECTORY = path.resolve(import.meta.dir, "../../../desktop-electron")

test("validates a recoverable PDF using the bundled Node worker", async () => {
  await using project = await tmpdir()
  const artifactDirectory = path.join(project.path, "artifact")
  const build = await Bun.build({
    entrypoints: [
      path.resolve(import.meta.dir, "../../src/resources/reader-source-validator.ts"),
      path.resolve(import.meta.dir, "../../src/resources/pdf-validation-worker.ts"),
    ],
    format: "esm",
    minify: true,
    outdir: artifactDirectory,
    target: "node",
  })
  expect(build.success).toBeTrue()

  const sourcePath = path.join(project.path, "recoverable.pdf")
  await writeFile(sourcePath, createRecoverableBrokenXrefTextPdf("Bundled PDF recovery"), "utf8")
  const runnerPath = path.join(project.path, "validate-pdf.mjs")
  await writeFile(
    runnerPath,
    `
      const { pathToFileURL } = await import("node:url")
      const [modulePath, sourcePath] = process.argv.slice(2)
      const { validateReaderSourcePath } = await import(pathToFileURL(modulePath).href)
      console.log(JSON.stringify(await validateReaderSourcePath(sourcePath)))
    `,
    "utf8",
  )
  const electronExecutable = resolveElectronBin(DESKTOP_PACKAGE_DIRECTORY)

  const child = Bun.spawn(
    [
      electronExecutable,
      runnerPath,
      path.join(artifactDirectory, "reader-source-validator.js"),
      sourcePath,
    ],
    {
      env: { ...process.env, [ELECTRON_RUN_AS_NODE_ENV]: "1" },
      stderr: "pipe",
      stdout: "pipe",
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect(stderr.includes("ReferenceError: DOMMatrix is not defined")).toBeFalse()
  expect(stderr.includes("Setting up fake worker failed")).toBeFalse()
  if (exitCode !== 0) throw new Error(`Bundled PDF validation failed:\n${stderr}`)
  expect(JSON.parse(stdout)).toEqual({
    format: "pdf",
    sourceValidity: "valid",
    reason: null,
  })
}, 20_000)
