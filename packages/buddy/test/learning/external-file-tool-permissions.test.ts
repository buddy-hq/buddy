import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { benchPresentTool } from "../../src/learning/features/bench/tools/present"
import { imagegenTool } from "../../src/learning/features/image-generation/tools/imagegen"
import { presentMediaTool } from "../../src/learning/features/media-presentations/tools/present-media"
import { prepareResourceTool } from "../../src/learning/features/reading/tools/prepare-resource"
import { browserSvgRenderRequests } from "../../src/learning/features/svg-rendering/service/browser-render-requests"
import { renderSvgTool } from "../../src/learning/features/svg-rendering/tools/render-svg"
import { createWhiteboardViewTool } from "../../src/learning/features/whiteboard/tools/create-view"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const PERMISSION_REJECTED_MESSAGE = "permission rejected"

function rejectingContext(input: {
  directory: string
  rejectPermission: string
  requests: Parameters<BuddyToolContext["ask"]>[0][]
}): BuddyToolContext {
  const context = createBuddyToolContext({ directory: input.directory, agent: "buddy" })
  context.ask = async (request) => {
    input.requests.push(request)
    if (request.permission === input.rejectPermission) {
      throw new Error(PERMISSION_REJECTED_MESSAGE)
    }
  }
  return context
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  )
}

afterEach(() => {
  browserSvgRenderRequests.reset()
})

describe("external file tool permissions", () => {
  test("bench_present does not create an object when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "image.png")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "image")

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          benchPresentTool.run(
            {
              action: "present_file",
              path: filePath,
            },
            rejectingContext({
              directory: project.path,
              rejectPermission: "external_directory",
              requests,
            }),
          ),
      }),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["external_directory"])
    expect(await pathExists(path.join(project.path, ".buddy"))).toBe(false)
  })

  test("present_media does not create an object when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "image.png")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "image")

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          presentMediaTool.run(
            { items: [{ path: filePath }] },
            rejectingContext({
              directory: project.path,
              rejectPermission: "external_directory",
              requests,
            }),
          ),
      }),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["external_directory"])
    expect(await pathExists(path.join(project.path, ".buddy"))).toBe(false)
  })

  test("prepare_resource does not register an object when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "lesson.pdf")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "resource")

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          prepareResourceTool.run(
            { sourcePath: filePath, waitUntilReady: false },
            rejectingContext({
              directory: project.path,
              rejectPermission: "external_directory",
              requests,
            }),
          ),
      }),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["external_directory"])
    expect(await pathExists(path.join(project.path, ".buddy"))).toBe(false)
  })

  test("render_svg does not render or write when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "molecule.svg")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          renderSvgTool.run(
            { filePath, format: "smiles", source: "CCO" },
            rejectingContext({
              directory: project.path,
              rejectPermission: "external_directory",
              requests,
            }),
          ),
      }),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["external_directory"])
    expect(browserSvgRenderRequests.listPending(project.path)).toEqual([])
    expect(await pathExists(filePath)).toBe(false)
  })

  test("imagegen does not read or upload references when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "reference.png")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "image")

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          imagegenTool.run(
            { prompt: "Edit this image", referenced_image_paths: [filePath] },
            rejectingContext({
              directory: project.path,
              rejectPermission: "external_directory",
              requests,
            }),
          ),
      }),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["external_directory"])
  })

  test("whiteboard_create_view does not create state before permission", async () => {
    await using project = await tmpdir({ git: true })
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []

    await expect(
      createWhiteboardViewTool.run(
        {
          objectAction: "create",
          boardAction: "continue_current_board",
          elements: "[]",
        },
        rejectingContext({
          directory: project.path,
          rejectPermission: "whiteboard_create_view",
          requests,
        }),
      ),
    ).rejects.toThrow(PERMISSION_REJECTED_MESSAGE)

    expect(requests.map((request) => request.permission)).toEqual(["whiteboard_create_view"])
    expect(await pathExists(path.join(project.path, ".buddy"))).toBe(false)
  })
})
