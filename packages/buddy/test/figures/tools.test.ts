import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src"
import { renderGeometryFigure } from "../../src/learning/features/figure-rendering/geometry/render-figure"
import { RenderFigureOutputSchema } from "../../src/learning/features/figure-rendering/geometry/types"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectResultSchema,
  type BuddyObjectResult,
  type BuddyObjectRef,
} from "../../src/objects"
import type { RenderFigureInput } from "../../src/learning/features/figure-rendering/geometry/tools/render-figure"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

const FIGURE_SVG_FILE_NAME = "figure.svg"

function figureFile(directory: string, objectID: string, revisionID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.figure,
    objectID,
    "revisions",
    revisionID,
    FIGURE_SVG_FILE_NAME,
  )
}

function figureRelativePath(objectID: string, revisionID: string): string {
  return `${BuddyObjectPath.relativeObjectDirectory(
    BUDDY_OBJECT_KINDS.figure,
    objectID,
  )}/revisions/${revisionID}/${FIGURE_SVG_FILE_NAME}`
}

function requireFigureRef(result: BuddyObjectResult): BuddyObjectRef {
  const ref = result.primaryRef
  expect(ref).not.toBeNull()
  if (!ref) {
    throw new Error("Expected a primary figure object reference.")
  }
  expect(ref.kind).toBe(BUDDY_OBJECT_KINDS.figure)
  return ref
}

function requireRevisionID(ref: BuddyObjectRef): string {
  expect(ref.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  if (!ref.revisionID) {
    throw new Error("Expected a figure revision id.")
  }
  return ref.revisionID
}

function requireFigureData(result: BuddyObjectResult) {
  const data = result.presentations[0]?.data
  expect(data).toMatchObject({
    renderer: "figure",
    renderStatus: "ready",
  })
  if (data?.renderer !== "figure") {
    throw new Error("Expected figure presentation data.")
  }
  return data
}

function requireObjectTitle(result: BuddyObjectResult): string {
  const title = result.objects[0]?.title
  expect(title).toBeTruthy()
  if (!title) {
    throw new Error("Expected a figure object title.")
  }
  return title
}

function baseFigureInput(): RenderFigureInput {
  return {
    spec: {
      canvas: {
        width: 240,
        height: 180,
        padding: 24,
      },
      points: [
        { id: "A", x: 40, y: 140, label: "A" },
        { id: "B", x: 40, y: 40, label: "B" },
        { id: "C", x: 180, y: 140, label: "C" },
      ],
      segments: [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "A", to: "C", label: "c" },
      ],
      markers: [{ type: "right-angle" as const, at: "A", alongA: "B", alongB: "C" }],
    },
  }
}

describe("figure tools", () => {
  test("renders a valid geometry figure into a stable SVG object", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderFigure = requireTool(tools, "render_figure")

        return renderFigure.execute(
          baseFigureInput(),
          createToolContext({
            sessionID: "ses_math",
            messageID: "msg_math",
            agent: "buddy",
          }),
        )
      },
    })

    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const objectRef = requireFigureRef(objectResult)
    const revisionID = requireRevisionID(objectRef)
    const figureData = requireFigureData(objectResult)
    const title = requireObjectTitle(objectResult)

    const response = await app.request(
      `/api/objects/${objectRef.kind}/${objectRef.objectID}?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    const body: unknown = await response.json()
    const manifest = RenderFigureOutputSchema.parse({
      objectID: objectRef.objectID,
      revisionID,
      mime: "image/svg+xml",
      rawUrl: figureData.svgUrl,
      relativePath: figureRelativePath(objectRef.objectID, revisionID),
      alt: title,
      caption: figureData.caption,
      markdown: `![${title}](${figureData.svgUrl})`,
      repairAttempts: 0,
    })
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: "ready",
      manifest: {
        kind: BUDDY_OBJECT_KINDS.figure,
        objectID: objectRef.objectID,
      },
    })
    const filepath = figureFile(project.path, manifest.objectID, manifest.revisionID)
    const svg = await fs.readFile(filepath, "utf8")

    expect(manifest.repairAttempts).toBe(0)
    expect(manifest.objectID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(manifest.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(manifest.relativePath).toBe(figureRelativePath(manifest.objectID, manifest.revisionID))
    expect(manifest.alt).toBe("Geometry figure")
    expect(manifest.markdown).toContain(`/api/objects/figure/${manifest.objectID}/raw?directory=`)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("</svg>")
    expect(svg).toContain('paint-order="stroke fill"')
    expect(svg).toContain('width="288"')
    expect(svg).toContain('height="228"')
    expect(svg).toContain('transform="translate(24, 24)"')
  })

  test("repairs removable spec issues before returning a rendered figure", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderFigure = requireTool(tools, "render_figure")

        const input = baseFigureInput()
        input.spec.points.push({ id: "A", x: 40, y: 140, label: "A2" })
        input.spec.segments?.push({ from: "A", to: "Z" })
        input.spec.markers = [{ type: "tick", from: "A", to: "Z" }]

        return renderFigure.execute(
          input,
          createToolContext({
            sessionID: "ses_math",
            messageID: "msg_math",
            agent: "buddy",
          }),
        )
      },
    })

    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const objectRef = requireFigureRef(objectResult)
    const revisionID = requireRevisionID(objectRef)

    const svg = await fs.readFile(
      figureFile(project.path, objectRef.objectID, revisionID),
      "utf8",
    )
    expect(svg).toContain("<svg")
  })

  test("tool metadata references only the rendered figure object", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderFigure = requireTool(tools, "render_figure")

        return renderFigure.execute(
          baseFigureInput(),
          createToolContext({
            sessionID: "ses_math",
            messageID: "msg_math",
            agent: "buddy",
          }),
        )
      },
    })

    const metadataValue = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const ref = requireFigureRef(metadataValue)
    const revisionID = requireRevisionID(ref)

    expect(ref.objectID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    requireFigureData(metadataValue)
    const indexResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}`,
    )
    const indexBody: unknown = await indexResponse.json()
    expect(indexBody).toMatchObject({
      objects: [{ objectID: ref.objectID, kind: BUDDY_OBJECT_KINDS.figure }],
    })
    expect(JSON.stringify(indexBody)).not.toContain('"kind":"media-presentation"')
  })

  test("resolves perpendicular-foot constraints so derived helper lines land exactly on the base", async () => {
    await using project = await tmpdir({ git: true })

    const rendered = await renderGeometryFigure(project.path, {
      spec: {
        canvas: {
          width: 260,
          height: 200,
          padding: 24,
        },
        points: [
          { id: "A", x: 40, y: 150, label: "A" },
          { id: "B", x: 210, y: 150, label: "B" },
          { id: "C", x: 90, y: 40, label: "C" },
          { id: "D", x: 132, y: 98, label: "D" },
        ],
        segments: [
          { from: "A", to: "B", label: "c" },
          { from: "A", to: "C", label: "b" },
          { from: "C", to: "B", label: "a" },
          { from: "C", to: "D", style: "dashed" },
        ],
        constraints: [
          {
            type: "perpendicular-foot",
            point: "D",
            source: "C",
            from: "A",
            to: "B",
          },
        ],
      },
    })

    const svg = await fs.readFile(
      figureFile(project.path, rendered.objectID, rendered.revisionID),
      "utf8",
    )
    expect(svg).toContain('x1="90" y1="40" x2="90" y2="150"')
  })
})
