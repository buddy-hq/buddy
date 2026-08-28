import { describe, expect, test } from "bun:test"
import { mkdir, readdir, readFile, truncate, writeFile } from "node:fs/promises"
import path from "node:path"
import { NATIVE_RESOURCE_FORMATS } from "@buddy/workspace-file-policy"
import { app } from "../src/index.ts"
import { tmpdir } from "./helpers/tmpdir"
import { parseJsonObject, requireString } from "./helpers/parse"

const DIRECTORY_HEADER = "x-buddy-directory" as const
const JSON_CONTENT_TYPE = "application/json" as const
const LARGE_FILE_SIZE_BYTES = 64 * 1024 * 1024 + 1

async function uploadRequest(directory: string, sourcePath: string): Promise<Response> {
  return await app.request("/api/notebook/uploads", {
    method: "POST",
    headers: {
      [DIRECTORY_HEADER]: directory,
      "content-type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({ sourcePath }),
  })
}

describe("notebook upload route", () => {
  test("copies every native format into flat uploads with unique published names", async () => {
    await using project = await tmpdir({ git: true })

    for (const format of NATIVE_RESOURCE_FORMATS) {
      const sourcePath = path.join(project.path, `lesson.${format}`)
      await writeFile(sourcePath, `content-${format}`, "utf8")
      const response = await uploadRequest(project.path, sourcePath)
      expect(response.status).toBe(200)
      const result = parseJsonObject(await response.json())
      if (result === undefined) throw new Error("Expected an upload response object")
      expect(result.displayName).toBe(`lesson.${format}`)
      expect(result.format).toBe(format)
      expect(requireString(result.uploadID, "uploadID").length).toBe(10)
      expect(String(result.workspacePath)).toMatch(
        new RegExp(`^uploads/lesson--[A-Za-z0-9_-]{10}\\.${format}$`, "u"),
      )
      expect(await readFile(String(result.absolutePath), "utf8")).toBe(`content-${format}`)
    }

    const uploadEntries = await readdir(path.join(project.path, "uploads"))
    expect(uploadEntries).toHaveLength(NATIVE_RESOURCE_FORMATS.length)
    expect(uploadEntries.every((entry) => !entry.startsWith(".buddy-upload-"))).toBe(true)
  })

  test("never overwrites when the same display name is uploaded twice", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "worksheet.xlsx")
    await writeFile(sourcePath, "first", "utf8")
    const firstResponse = await uploadRequest(project.path, sourcePath)
    await writeFile(sourcePath, "second", "utf8")
    const secondResponse = await uploadRequest(project.path, sourcePath)
    const first = parseJsonObject(await firstResponse.json())
    const second = parseJsonObject(await secondResponse.json())
    if (first === undefined || second === undefined) throw new Error("Expected upload results")

    expect(first.absolutePath).not.toBe(second.absolutePath)
    expect(await readFile(String(first.absolutePath), "utf8")).toBe("first")
    expect(await readFile(String(second.absolutePath), "utf8")).toBe("second")
  })

  test("rejects missing paths, directories, unknown binaries, and oversized documents", async () => {
    await using project = await tmpdir({ git: true })
    const diskImagePath = path.join(project.path, "installer.dmg")
    const unsupportedWorkbookPath = path.join(project.path, "legacy.wk1")
    const largePdfPath = path.join(project.path, "large.pdf")
    const directoryPath = path.join(project.path, "folder.pdf")
    await writeFile(diskImagePath, "binary", "utf8")
    await writeFile(unsupportedWorkbookPath, "binary", "utf8")
    await writeFile(largePdfPath, "", "utf8")
    await truncate(largePdfPath, LARGE_FILE_SIZE_BYTES)
    await mkdir(directoryPath)

    const responses = await Promise.all([
      uploadRequest(project.path, path.join(project.path, "missing.pdf")),
      uploadRequest(project.path, directoryPath),
      uploadRequest(project.path, diskImagePath),
      uploadRequest(project.path, unsupportedWorkbookPath),
      uploadRequest(project.path, largePdfPath),
    ])
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400])
    await expect(readdir(path.join(project.path, "uploads"))).rejects.toThrow()
  })
})
