import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  buildPresentedMediaObjectOutput,
  PresentedMediaValidationError,
  readPresentedMediaObject,
} from "../../src/learning/features/media-presentations/service/file-media"
import { resolveBuddyHomeDirectory } from "../../src/storage/constants"
import { createBuddyToolContext, requireTool, listBuddyTools } from "../helpers/tools"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { BuddyObjectResultSchema } from "../../src/objects"
import { tmpdir } from "../helpers/tmpdir"

describe("present media", () => {
  test("builds gallery layout for multiple images", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "generated"), { recursive: true })
    await fs.writeFile(path.join(project.path, "generated", "a.png"), "image-a")
    await fs.writeFile(path.join(project.path, "generated", "b.png"), "image-b")

    const output = await buildPresentedMediaObjectOutput({
      directory: project.path,
      items: [
        {
          path: "generated/a.png",
        },
        {
          path: "generated/b.png",
        },
      ],
    })

    expect(output.output.layout).toBe("grid")
    expect(output.output.items).toHaveLength(2)
    expect(output.output.items.every((item) => item.renderMode === "image")).toBe(true)
  })

  test("uses an explicit semantic object title", async () => {
    await using project = await tmpdir({ git: true })
    const imagePath = path.join(project.path, "generated.png")
    await fs.writeFile(imagePath, "image")

    const output = await buildPresentedMediaObjectOutput({
      directory: project.path,
      title: "Waving Orange Panda",
      items: [{ path: imagePath }],
    })

    expect(output.manifest.title).toBe("Waving Orange Panda")
  })

  test("returns metadata and raw URLs for absolute local paths outside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    await using localDir = await temporaryDirectory({ prefix: "buddy-present-media-local-" })
    const localPath = path.join(localDir.path, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await buildPresentedMediaObjectOutput({
      directory: project.path,
      items: [
        {
          path: localPath,
        },
      ],
    })

    expect(output.output.items[0]?.displayPath).toBe(await fs.realpath(localPath))
    expect(output.output.items[0]?.absolutePath).toBe(await fs.realpath(localPath))
    expect(output.output.items[0]?.actionCapabilities.canOpenInWorkspacePanel).toBe(false)
    expect(output.output.items[0]?.rawUrl?.startsWith("/api/objects/media-presentation/")).toBe(
      true,
    )
    expect(output.output.items[0]?.rawUrl).toContain(`/${output.output.objectID}/raw/media_item_1`)
    expect(output.output.items[0]?.rawUrl).toContain(
      `directory=${encodeURIComponent(project.path)}`,
    )
    expect(output.output.items[0]?.rawUrl).toContain("fileName=outside.png")
    expect(output.output.items[0]?.rawUrl?.includes(encodeURIComponent(localPath))).toBe(false)
    expect(output.inlineData.items[0]?.sizeBytes).toBe("local-image".length)
    expect(output.inlineData.items[0]?.modifiedAt).toBeTruthy()
  })

  test("returns structured metadata for a presented PDF", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "generated"), { recursive: true })
    await fs.writeFile(path.join(project.path, "generated", "notes.pdf"), "pdf-content")

    const tools = await listBuddyTools()
    const presentMedia = requireTool(tools, "present_media")
    const result = await presentMedia.run(
      {
        items: [
          {
            path: "generated/notes.pdf",
          },
        ],
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: "ses_media",
        messageID: "msg_media",
        agent: "buddy",
      }),
    )

    const objectResult = BuddyObjectResultSchema.parse(result.metadata.buddyObjectResult)
    expect(result.output).toContain("Presented 1 media item")
    expect(objectResult.primaryRef?.kind).toBe("media-presentation")
    expect(objectResult.primaryRef?.objectID).toBeTruthy()
    expect(objectResult.presentations[0]?.data).toMatchObject({
      items: [expect.objectContaining({ mediaType: "pdf", mimeType: "application/pdf" })],
    })
  })

  test("accepts a file url path", async () => {
    await using project = await tmpdir({ git: true })
    await using localDir = await temporaryDirectory({
      prefix: "buddy-present-media-file-url-",
    })
    const localPath = path.join(localDir.path, "outside.png")
    await fs.writeFile(localPath, "local-image")

    const output = await buildPresentedMediaObjectOutput({
      directory: project.path,
      items: [
        {
          path: pathToFileURL(localPath).toString(),
        },
      ],
    })

    expect(output.output.items[0]?.actionCapabilities.canOpenInWorkspacePanel).toBe(false)
  })

  test("accepts a home-relative path", async () => {
    await using project = await tmpdir({ git: true })
    const testHome = resolveBuddyHomeDirectory()
    await using homeDir = await temporaryDirectory({
      parentDirectory: testHome,
      prefix: "buddy-present-media-home-",
    })
    const localPath = path.join(homeDir.path, "outside.png")
    const homeRelativePath = `~/${path.relative(testHome, localPath).split(path.sep).join("/")}`
    await fs.writeFile(localPath, "local-image")

    const output = await buildPresentedMediaObjectOutput({
      directory: project.path,
      items: [
        {
          path: homeRelativePath,
        },
      ],
    })

    expect(output.output.items[0]?.absolutePath).toBe(await fs.realpath(localPath))
  })

  test("fails for missing local path", async () => {
    await using project = await tmpdir({ git: true })
    await using missingRoot = await temporaryDirectory({
      prefix: "buddy-present-media-missing-",
    })

    await expect(
      (async () =>
        buildPresentedMediaObjectOutput({
          directory: project.path,
          items: [
            {
              path: path.join(missingRoot.path, "does-not-exist.png"),
            },
          ],
        }))(),
    ).rejects.toBeInstanceOf(PresentedMediaValidationError)
  })

  test("refreshes item availability after a presented file is deleted", async () => {
    await using project = await tmpdir({ git: true })
    const firstPath = path.join(project.path, "first.txt")
    const secondPath = path.join(project.path, "second.txt")
    await fs.writeFile(firstPath, "first")
    await fs.writeFile(secondPath, "second")

    const result = await buildPresentedMediaObjectOutput({
      directory: project.path,
      items: [{ path: firstPath }, { path: secondPath }],
    })
    await fs.rm(secondPath)

    const read = await readPresentedMediaObject({
      directory: project.path,
      objectID: result.output.objectID,
    })
    expect(read.inlineData.items.map((item) => item.availability)).toEqual(["available", "missing"])
  })
})
