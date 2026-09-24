import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { app } from "../src/index"
import { buildPresentedMediaObjectOutput } from "../src/learning/features/media-presentations/service/file-media"
import { BUDDY_OBJECT_KINDS, deleteObject } from "../src/objects"
import { createGitRepo } from "./helpers/repo"
import { temporaryDirectory } from "./helpers/temporary-directory"

describe("presented media raw routes", () => {
  test("serves presented media raw URLs for local files outside the workspace", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route")
    await using localDir = await temporaryDirectory({ prefix: "buddy-presented-media-route-" })
    const localPath = path.join(localDir.path, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    const rawUrl = output.output.items[0]?.rawUrl
    expect(rawUrl).toBeTruthy()

    const response = await app.request(rawUrl ?? "")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("local-image")
    expect(response.headers.get("content-disposition")).toContain("outside.png")
    expect(response.headers.get("accept-ranges")).toBe("bytes")
  })

  test("serves HEAD requests for object raw URLs using the encoded directory", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-head")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-head-",
    })
    const localPath = path.join(localDir.path, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    const rawUrl = output.output.items[0]?.rawUrl
    expect(rawUrl).toBeTruthy()

    const response = await app.request(rawUrl ?? "", { method: "HEAD" })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain("outside.png")
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("content-length")).toBe(String("local-image".length))
  })

  test("serves relative Markdown assets through the owning presented item", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-markdown-asset")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-markdown-asset-",
    })
    const localPath = path.join(localDir.path, "notes.md")
    const imagePath = path.join(localDir.path, "images", "cat.png")
    await fs.mkdir(path.dirname(imagePath), { recursive: true })
    await fs.writeFile(localPath, "![Cat](./images/cat.png)")
    await fs.writeFile(imagePath, "cat-image")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [{ path: localPath }],
        }),
    })
    const rawUrl = output.output.items[0]?.rawUrl ?? ""

    const response = await app.request(`${rawUrl}&relativePath=images%2Fcat.png`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("cat-image")
    expect(response.headers.get("content-disposition")).toContain("cat.png")

    const escaped = await app.request(`${rawUrl}&relativePath=..%2Foutside.png`)
    expect(escaped.status).toBe(404)
  })

  test("reports current availability without fetching media bytes", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-availability")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-availability-",
    })
    const localPath = path.join(localDir.path, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [{ path: localPath }],
        }),
    })
    await fs.rm(localPath)

    const availabilityUrl = `/api/objects/media-presentation/${output.output.objectID}/items/media_item_1/availability?directory=${encodeURIComponent(repo.path)}`
    const response = await app.request(availabilityUrl)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "missing",
      message: "File not found",
    })

    const missingItemResponse = await app.request(
      `/api/objects/media-presentation/${output.output.objectID}/items/unknown/availability?directory=${encodeURIComponent(repo.path)}`,
    )
    expect(missingItemResponse.status).toBe(404)
    expect(await missingItemResponse.json()).toEqual({ error: "File not found" })
  })

  test("serves bounded, open-ended, and suffix byte ranges", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-ranges")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-ranges-",
    })
    const localPath = path.join(localDir.path, "outside.mp4")
    await fs.writeFile(localPath, "0123456789")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [{ path: localPath }],
        }),
    })
    const rawUrl = output.output.items[0]?.rawUrl ?? ""

    const bounded = await app.request(rawUrl, {
      headers: { range: "bytes=2-5" },
    })
    expect(bounded.status).toBe(206)
    expect(await bounded.text()).toBe("2345")
    expect(bounded.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(bounded.headers.get("content-length")).toBe("4")

    const openEnded = await app.request(rawUrl, {
      headers: { range: "bytes=7-" },
    })
    expect(openEnded.status).toBe(206)
    expect(await openEnded.text()).toBe("789")
    expect(openEnded.headers.get("content-range")).toBe("bytes 7-9/10")

    const suffix = await app.request(rawUrl, {
      headers: { range: "bytes=-3" },
    })
    expect(suffix.status).toBe(206)
    expect(await suffix.text()).toBe("789")
    expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10")
  })

  test("returns 416 for invalid or unsatisfiable ranges", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-invalid-range")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-invalid-range-",
    })
    const localPath = path.join(localDir.path, "outside.mp4")
    await fs.writeFile(localPath, "0123456789")

    const output = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo.path,
          items: [{ path: localPath }],
        }),
    })
    const rawUrl = output.output.items[0]?.rawUrl ?? ""

    for (const range of [
      "bytes=10-",
      "bytes=5-2",
      "bytes=0-1,4-5",
      "items=0-1",
      "bytes=1x-4",
      "bytes=1.5-4",
      "bytes=-3x",
    ]) {
      const response = await app.request(rawUrl, {
        headers: { range },
      })
      expect(response.status).toBe(416)
      expect(response.headers.get("content-range")).toBe("bytes */10")
      expect(response.headers.get("content-length")).toBe("0")
    }
  })
})

function postMediaFile(url: string, filePath: string) {
  return app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: filePath }),
  })
}

async function mediaObjectID(response: Response) {
  return z.object({ objectID: z.string() }).parse(await response.json()).objectID
}

describe("presented media file routes", () => {
  test("resolves notebook, relative, and outside files without presenting them", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-resolve")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-resolve-",
    })
    const notebookPath = path.join(repo.path, "notes.md")
    const outsidePath = path.join(localDir.path, "report.pdf")
    await fs.writeFile(notebookPath, "# Notes")
    await fs.writeFile(outsidePath, "report")
    const resolveUrl = `/api/objects/media-presentation/files/resolve?directory=${encodeURIComponent(repo.path)}`

    const notebook = await postMediaFile(resolveUrl, notebookPath)
    expect(notebook.status).toBe(200)
    expect(await notebook.json()).toMatchObject({ workspacePath: "notes.md", fileName: "notes.md" })

    const outside = await postMediaFile(resolveUrl, path.relative(repo.path, outsidePath))
    expect(outside.status).toBe(200)
    expect(await outside.json()).toMatchObject({
      absolutePath: await fs.realpath(outsidePath),
      workspacePath: null,
      fileName: "report.pdf",
      renderMode: "pdf",
    })

    const missing = await postMediaFile(resolveUrl, path.join(localDir.path, "missing.pdf"))
    expect(missing.status).toBe(404)

    const directory = await postMediaFile(resolveUrl, localDir.path)
    expect(directory.status).toBe(400)
    expect(await directory.json()).toEqual({ error: "Path is not a file" })
  })

  test("presents an outside file as one reusable object", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-present")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-present-",
    })
    const outsidePath = path.join(localDir.path, "outside.md")
    await fs.writeFile(outsidePath, "outside notes")
    const presentUrl = `/api/objects/media-presentation/files?directory=${encodeURIComponent(repo.path)}`

    const first = await postMediaFile(presentUrl, outsidePath)
    expect(first.status).toBe(200)
    const { objectID } = z.object({ objectID: z.string() }).parse(await first.json())

    const second = await postMediaFile(presentUrl, outsidePath)
    expect(await second.json()).toEqual({ objectID })

    const raw = await app.request(
      `/api/objects/media-presentation/${objectID}/raw/media_item_1?directory=${encodeURIComponent(repo.path)}`,
    )
    expect(raw.status).toBe(200)
    expect(await raw.text()).toBe("outside notes")
  })

  test("reuses an object the agent already presented for the same file", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-reuse-agent")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-reuse-agent-",
    })
    const warmPath = path.join(localDir.path, "warm.md")
    const presentedPath = path.join(localDir.path, "presented.pdf")
    await fs.writeFile(warmPath, "warm")
    await fs.writeFile(presentedPath, "presented")
    const presentUrl = `/api/objects/media-presentation/files?directory=${encodeURIComponent(repo.path)}`

    expect((await postMediaFile(presentUrl, warmPath)).status).toBe(200)
    const presented = await OpenCodeInstance.provide({
      directory: repo.path,
      fn: async () =>
        buildPresentedMediaObjectOutput({ directory: repo.path, items: [{ path: presentedPath }] }),
    })

    const reopened = await postMediaFile(presentUrl, presentedPath)
    expect(await reopened.json()).toEqual({ objectID: presented.output.objectID })
  })

  test("replaces a deleted file object with a new one", async () => {
    await using repo = await createGitRepo("buddy-presented-media-route-deleted")
    await using localDir = await temporaryDirectory({
      prefix: "buddy-presented-media-route-deleted-",
    })
    const outsidePath = path.join(localDir.path, "outside.md")
    await fs.writeFile(outsidePath, "outside notes")
    const presentUrl = `/api/objects/media-presentation/files?directory=${encodeURIComponent(repo.path)}`
    const deletedID = await mediaObjectID(await postMediaFile(presentUrl, outsidePath))
    await deleteObject({
      directory: repo.path,
      kind: BUDDY_OBJECT_KINDS.mediaPresentation,
      objectID: deletedID,
    })

    const replacementID = await mediaObjectID(await postMediaFile(presentUrl, outsidePath))
    expect(replacementID).not.toBe(deletedID)
    expect(await mediaObjectID(await postMediaFile(presentUrl, outsidePath))).toBe(replacementID)
  })
})
