import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { app } from "../src/index"
import { buildPresentedMediaObjectOutput } from "../src/learning/features/media-presentations/service/file-media"
import { createGitRepo } from "./helpers/repo"

describe("presented media raw routes", () => {
  test("serves presented media raw URLs for local files outside the workspace", async () => {
    const repo = createGitRepo("buddy-presented-media-route")
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-presented-media-route-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo,
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
    const repo = createGitRepo("buddy-presented-media-route-head")
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-presented-media-route-head-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo,
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

  test("reports current availability without fetching media bytes", async () => {
    const repo = createGitRepo("buddy-presented-media-route-availability")
    const localDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "buddy-presented-media-route-availability-"),
    )
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo,
          items: [{ path: localPath }],
        }),
    })
    await fs.rm(localPath)

    const availabilityUrl = `/api/objects/media-presentation/${output.output.objectID}/items/media_item_1/availability?directory=${encodeURIComponent(repo)}`
    const response = await app.request(availabilityUrl)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "missing",
      message: "File not found",
    })

    const missingItemResponse = await app.request(
      `/api/objects/media-presentation/${output.output.objectID}/items/unknown/availability?directory=${encodeURIComponent(repo)}`,
    )
    expect(missingItemResponse.status).toBe(404)
    expect(await missingItemResponse.json()).toEqual({ error: "File not found" })
  })

  test("serves bounded, open-ended, and suffix byte ranges", async () => {
    const repo = createGitRepo("buddy-presented-media-route-ranges")
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-presented-media-route-ranges-"))
    const localPath = path.join(localDir, "outside.mp4")
    await fs.writeFile(localPath, "0123456789")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo,
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
    const repo = createGitRepo("buddy-presented-media-route-invalid-range")
    const localDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "buddy-presented-media-route-invalid-range-"),
    )
    const localPath = path.join(localDir, "outside.mp4")
    await fs.writeFile(localPath, "0123456789")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaObjectOutput({
          directory: repo,
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
