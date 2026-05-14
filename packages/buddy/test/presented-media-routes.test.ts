import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { app } from "../src/index"
import { buildPresentedMediaOutput } from "../src/learning/features/media-presentations/service/file-media"
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
        buildPresentedMediaOutput({
          directory: repo,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    const rawUrl = output.items[0]?.rawUrl
    expect(rawUrl).toBeTruthy()

    const response = await app.request(rawUrl ?? "")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("local-image")
    expect(response.headers.get("content-disposition")).toContain("outside.png")
  })

  test("serves HEAD requests for artifact-backed raw URLs using the encoded directory", async () => {
    const repo = createGitRepo("buddy-presented-media-route-head")
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-presented-media-route-head-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: repo,
      fn: async () =>
        buildPresentedMediaOutput({
          directory: repo,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    const rawUrl = output.items[0]?.rawUrl
    expect(rawUrl).toBeTruthy()

    const response = await app.request(rawUrl ?? "", { method: "HEAD" })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain("outside.png")
  })
})
