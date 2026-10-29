import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { benchPresentTool } from "../../src/learning/features/bench/tools/present"
import { imagegenTool } from "../../src/learning/features/image-generation/tools/imagegen"
import { presentMediaTool } from "../../src/learning/features/media-presentations/tools/present-media"
import { prepareResourceTool } from "../../src/learning/features/reading/tools/prepare-resource"
import { browserSvgRenderRequests } from "../../src/learning/features/svg-rendering/service/browser-render-requests"
import { renderSvgTool } from "../../src/learning/features/svg-rendering/tools/render-svg"
import { createWhiteboardViewTool } from "../../src/learning/features/whiteboard/tools/create-view"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { createBuddyToolContext, ensureBuddyPluginTools } from "../helpers/tools"
import { scriptedToolModel } from "../helpers/scripted-tool-model"
import { tmpdir } from "../helpers/tmpdir"

const PERMISSION_REJECTED_MESSAGE = "permission rejected"

function rejectingContext(input: {
  directory: string
  rejectPermission: string
  requests: Parameters<BuddyToolContext["ask"]>[0][]
}): BuddyToolContext {
  const context = createBuddyToolContext({
    directory: input.directory,
    agent: "buddy",
  })
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
  test("routes an external media request through v2 permissions before creating an object", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        model: "scripted/chat",
        provider: {
          scripted: {
            npm: "@ai-sdk/perplexity",
            options: { apiKey: "test" },
            models: { chat: {} },
          },
        },
      },
    })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "image.png")
    await Bun.write(filePath, "image")
    await using runtime = await ensureBuddyPluginTools(project.path, [
      scriptedToolModel({ name: "present_media", arguments: { items: [{ path: filePath }] } }),
    ])
    const session = await runtime.host.session.create({
      location: { directory: project.path },
      agent: "buddy",
      model: { providerID: "scripted", id: "chat" },
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "external_directory", resource: "*", effect: "ask" },
      ],
    })
    const controller = new AbortController()
    const events = runtime.host.event
      .subscribe({ signal: controller.signal })
      [Symbol.asyncIterator]()
    try {
      await events.next()
      const pending = (async () => {
        while (true) {
          const event = await events.next()
          if (event.done) throw new Error("Runtime event stream ended before external permission")
          if (event.value.type === "permission.asked" && event.value.data.sessionID === session.id)
            return event.value.data
          if (
            event.value.type === "session.execution.succeeded" &&
            event.value.data.sessionID === session.id
          )
            throw new Error("Turn completed without external permission")
          if (
            event.value.type === "session.execution.failed" &&
            event.value.data.sessionID === session.id
          )
            throw new Error(event.value.data.error.message)
        }
      })()
      await runtime.host.session.prompt({
        sessionID: session.id,
        text: "Present the external image.",
      })
      const request = await pending
      expect(request.action).toBe("external_directory")
      expect(request.metadata).toMatchObject({
        filepath: filePath,
        parentDir: path.dirname(filePath),
      })
      expect(request.source).toMatchObject({ type: "tool", id: "call-feature-tool" })
      await runtime.host.permission.reply({
        sessionID: session.id,
        requestID: request.id,
        decision: "reject",
        message: "Keep this file private.",
      })
      await runtime.host.session.wait({ sessionID: session.id })
      expect(await pathExists(path.join(project.path, ".buddy", "objects"))).toBe(false)
      expect(await runtime.host.permission.list({ sessionID: session.id })).toEqual([])
    } finally {
      controller.abort()
      await events.return?.()
    }
  })

  test("bench_present does not create an object when external access is rejected", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const filePath = path.join(external.path, "image.png")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "image")

    await expect(
      (() =>
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
        ))(),
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
      (() =>
        presentMediaTool.run(
          { items: [{ path: filePath }] },
          rejectingContext({
            directory: project.path,
            rejectPermission: "external_directory",
            requests,
          }),
        ))(),
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
      (() =>
        prepareResourceTool.run(
          { sourcePath: filePath, waitUntilReady: false },
          rejectingContext({
            directory: project.path,
            rejectPermission: "external_directory",
            requests,
          }),
        ))(),
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
      (() =>
        renderSvgTool.run(
          { filePath, format: "smiles", source: "CCO" },
          rejectingContext({
            directory: project.path,
            rejectPermission: "external_directory",
            requests,
          }),
        ))(),
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
      (() =>
        imagegenTool.run(
          { prompt: "Edit this image", referenced_image_paths: [filePath] },
          rejectingContext({
            directory: project.path,
            rejectPermission: "external_directory",
            requests,
          }),
        ))(),
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
