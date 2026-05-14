import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { presentMediaTool } from "../../src/learning/features/media-presentations/tools/present-media"
import {
  buildPresentedMediaOutput,
  PresentedMediaValidationError,
} from "../../src/learning/features/media-presentations/service/file-media"
import { registerBuddyTools } from "../../src/learning/runtime/register-buddy-tools"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

describe("present media", () => {
  test("builds gallery layout for multiple images", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "generated"), { recursive: true })
    await fs.writeFile(path.join(project.path, "generated", "a.png"), "image-a")
    await fs.writeFile(path.join(project.path, "generated", "b.png"), "image-b")

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () =>
        buildPresentedMediaOutput({
          directory: project.path,
          items: [
            {
              path: "generated/a.png",
            },
            {
              path: "generated/b.png",
            },
          ],
        }),
    })

    expect(output.layout).toBe("gallery")
    expect(output.items).toHaveLength(2)
    expect(output.items.every((item) => item.renderMode === "image")).toBe(true)
  })

  test("returns raw URLs for absolute local paths outside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-present-media-local-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () =>
        buildPresentedMediaOutput({
          directory: project.path,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    expect(output.items[0]?.displayPath).toBe(await fs.realpath(localPath))
    expect(output.items[0]?.actionCapabilities.canOpenInWorkspacePanel).toBe(false)
    expect(output.items[0]?.rawUrl?.startsWith("/api/presented-media/")).toBe(true)
    expect(output.items[0]?.rawUrl).toContain("/raw/media_item_1")
    expect(output.items[0]?.rawUrl).toContain(`directory=${encodeURIComponent(project.path)}`)
    expect(output.items[0]?.rawUrl).toContain("fileName=outside.png")
    expect(output.items[0]?.rawUrl?.includes(encodeURIComponent(localPath))).toBe(false)
  })

  test("registers present_media and returns structured metadata", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "generated"), { recursive: true })
    await fs.writeFile(path.join(project.path, "generated", "notes.pdf"), "pdf-content")

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await registerBuddyTools(project.path, [presentMediaTool])
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const presentMedia = requireTool(tools, "present_media")

        return presentMedia.execute(
          {
            items: [
              {
                path: "generated/notes.pdf",
              },
            ],
          },
          createToolContext({
            sessionID: "ses_media",
            messageID: "msg_media",
            agent: "buddy",
          }),
        )
      },
    })

    expect(result.output).toContain("Presented 1 media item")
    const metadataValue = result.metadata?.value as
      | { items: Array<{ renderMode: string }> }
      | undefined
    expect(result.metadata?.artifact).toBe("PresentedMediaOutput")
    expect(metadataValue?.items[0]?.renderMode).toBe("pdf")
  })

  test("accepts an absolute local image path outside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-present-media-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () =>
        buildPresentedMediaOutput({
          directory: project.path,
          items: [
            {
              path: localPath,
            },
          ],
        }),
    })

    expect(output.items[0]?.absolutePath).toBe(await fs.realpath(localPath))
    expect(output.items[0]?.actionCapabilities.canOpenInWorkspacePanel).toBe(false)
    expect(output.items[0]?.rawUrl?.startsWith("/api/presented-media/")).toBe(true)
    expect(output.items[0]?.rawUrl).toContain("/raw/media_item_1")
    expect(output.items[0]?.rawUrl?.includes(encodeURIComponent(localPath))).toBe(false)
  })

  test("accepts a file url path", async () => {
    await using project = await tmpdir({ git: true })
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-present-media-file-url-"))
    const localPath = path.join(localDir, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () =>
        buildPresentedMediaOutput({
          directory: project.path,
          items: [
            {
              path: new URL(`file://${localPath}`).toString(),
            },
          ],
        }),
    })

    expect(output.items[0]?.actionCapabilities.canOpenInWorkspacePanel).toBe(false)
  })

  test("accepts a home-relative path", async () => {
    await using project = await tmpdir({ git: true })
    const homeDir = os.homedir()
    const tempName = `buddy-present-media-home-${Date.now()}.png`
    const localPath = path.join(homeDir, tempName)
    await fs.writeFile(localPath, "local-image")

    try {
      const output = await OpenCodeInstance.provide({
        directory: project.path,
        fn: async () =>
          buildPresentedMediaOutput({
            directory: project.path,
            items: [
              {
                path: `~/${tempName}`,
              },
            ],
          }),
      })

      expect(output.items[0]?.absolutePath).toBe(await fs.realpath(localPath))
    } finally {
      await fs.rm(localPath, { force: true })
    }
  })

  test("fails for missing local path", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: async () =>
          buildPresentedMediaOutput({
            directory: project.path,
            items: [
              {
                path: path.join(os.tmpdir(), "buddy-not-found-does-not-exist.png"),
              },
            ],
          }),
      }),
    ).rejects.toBeInstanceOf(PresentedMediaValidationError)
  })
})
