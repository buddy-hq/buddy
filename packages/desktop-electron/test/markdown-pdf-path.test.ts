import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  isPathInsideDirectory,
  resolveAvailableMarkdownPdfExportPath,
} from "../src/main/markdown-pdf-path"

const TEMP_DIRECTORY_PREFIX = "buddy-markdown-pdf-path-"

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX))
}

describe("markdown PDF export paths", () => {
  const cleanupPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    )
  })

  test("sanitizes renderer-supplied default paths to a notebook-local file name", async () => {
    const root = await createTempDirectory()
    cleanupPaths.push(root)
    const notebook = join(root, "Notebook")
    await mkdir(notebook)
    const canonicalNotebook = await realpath(notebook)

    const resolved = await resolveAvailableMarkdownPdfExportPath({
      allowedRoots: [root],
      defaultPath: "../lesson.pdf",
      directory: notebook,
    })

    expect(resolved).toBe(join(canonicalNotebook, "lesson.pdf"))
  })

  test("increments the notebook-local file name when the export already exists", async () => {
    const root = await createTempDirectory()
    cleanupPaths.push(root)
    const notebook = join(root, "Notebook")
    await mkdir(notebook)
    await writeFile(join(notebook, "lesson.pdf"), "")
    const canonicalNotebook = await realpath(notebook)

    await expect(
      resolveAvailableMarkdownPdfExportPath({
        allowedRoots: [root],
        defaultPath: "lesson.pdf",
        directory: notebook,
      }),
    ).resolves.toBe(join(canonicalNotebook, "lesson (1).pdf"))
  })

  test("rejects renderer-supplied directories outside allowed notebook roots", async () => {
    const root = await createTempDirectory()
    cleanupPaths.push(root)
    const allowedRoot = join(root, "Allowed")
    const outsideRoot = join(root, "Outside")
    await mkdir(allowedRoot)
    await mkdir(outsideRoot)

    await expect(
      resolveAvailableMarkdownPdfExportPath({
        allowedRoots: [allowedRoot],
        defaultPath: "lesson.pdf",
        directory: outsideRoot,
      }),
    ).rejects.toThrow("outside the allowed notebook roots")
  })

  test("allows export into a separately configured Notes root", async () => {
    const root = await createTempDirectory()
    cleanupPaths.push(root)
    const notebookHome = join(root, "Buddy")
    const notesRoot = join(root, "Obsidian", "Vault")
    await mkdir(notebookHome)
    await mkdir(notesRoot, { recursive: true })

    await expect(
      resolveAvailableMarkdownPdfExportPath({
        allowedRoots: [notebookHome, notesRoot],
        defaultPath: "note.pdf",
        directory: notesRoot,
      }),
    ).resolves.toBe(join(await realpath(notesRoot), "note.pdf"))
  })

  test("detects paths outside a directory", () => {
    expect(
      isPathInsideDirectory(join("/tmp", "notebook", "lesson.pdf"), join("/tmp", "notebook")),
    ).toBe(true)
    expect(isPathInsideDirectory(join("/tmp", "lesson.pdf"), join("/tmp", "notebook"))).toBe(false)
    expect(
      isPathInsideDirectory(
        join("/tmp", "notebook", "..cache", "lesson.pdf"),
        join("/tmp", "notebook"),
      ),
    ).toBe(true)
  })
})
