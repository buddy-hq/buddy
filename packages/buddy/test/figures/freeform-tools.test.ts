import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src"
import { FreeformFigureRenderError } from "../../src/learning/features/figure-rendering/freeform/service/render"
import { renderFreeformFigure } from "../../src/learning/features/figure-rendering/freeform/service/render"
import { RenderFreeformFigureOutputSchema } from "../../src/learning/features/figure-rendering/freeform/types"
import type { RenderFreeformFigureInput } from "../../src/learning/features/figure-rendering/freeform/tools/render-freeform-figure"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectResultSchema,
  type BuddyObjectRef,
  type BuddyObjectResult,
} from "../../src/objects"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

const FREEFORM_FIGURE_SVG_FILE_NAME = "figure.svg"

function freeformFigureFile(directory: string, objectID: string, revisionID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.freeformFigure,
    objectID,
    "revisions",
    revisionID,
    FREEFORM_FIGURE_SVG_FILE_NAME,
  )
}

function freeformFigureRelativePath(objectID: string, revisionID: string): string {
  return `${BuddyObjectPath.relativeObjectDirectory(
    BUDDY_OBJECT_KINDS.freeformFigure,
    objectID,
  )}/revisions/${revisionID}/${FREEFORM_FIGURE_SVG_FILE_NAME}`
}

function requireFreeformFigureRef(result: BuddyObjectResult): BuddyObjectRef {
  const ref = result.primaryRef
  expect(ref).not.toBeNull()
  if (!ref) {
    throw new Error("Expected a primary freeform figure object reference.")
  }
  expect(ref.kind).toBe(BUDDY_OBJECT_KINDS.freeformFigure)
  return ref
}

function requireRevisionID(ref: BuddyObjectRef): string {
  expect(ref.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  if (!ref.revisionID) {
    throw new Error("Expected a freeform figure revision id.")
  }
  return ref.revisionID
}

function requireFreeformFigureData(result: BuddyObjectResult) {
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
    throw new Error("Expected a freeform figure object title.")
  }
  return title
}

function baseFreeformFigureInput(): RenderFreeformFigureInput {
  return {
    source: [
      "<!-- comment before the root should still parse -->",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">',
      '  <path d="M10 60 Q 60 10 110 60" fill="none" stroke="#1f2937" stroke-width="4" />',
      '  <circle cx="10" cy="60" r="4" fill="#1f2937" />',
      '  <circle cx="110" cy="60" r="4" fill="#1f2937" />',
      '  <text x="60" y="46" text-anchor="middle" font-size="12" fill="#1f2937">c</text>',
      "</svg>",
    ].join("\n"),
  }
}

describe("freeform figure tools", () => {
  test("renders valid unrestricted SVG into a stable object", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderFreeformFigure = requireTool(tools, "render_freeform_figure")

        return renderFreeformFigure.execute(
          baseFreeformFigureInput(),
          createToolContext({
            sessionID: "ses_math",
            messageID: "msg_math",
            agent: "buddy",
          }),
        )
      },
    })

    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const objectRef = requireFreeformFigureRef(objectResult)
    const revisionID = requireRevisionID(objectRef)
    const figureData = requireFreeformFigureData(objectResult)
    const title = requireObjectTitle(objectResult)
    const filepath = freeformFigureFile(project.path, objectRef.objectID, revisionID)
    const svg = await fs.readFile(filepath, "utf8")

    const output = RenderFreeformFigureOutputSchema.parse({
      objectID: objectRef.objectID,
      revisionID,
      mime: "image/svg+xml",
      rawUrl: figureData.svgUrl,
      relativePath: freeformFigureRelativePath(objectRef.objectID, revisionID),
      alt: title,
      caption: figureData.caption,
      markdown: `![${title}](${figureData.svgUrl})`,
      repairAttempts: 0,
    })

    expect(output.repairAttempts).toBe(0)
    expect(output.objectID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(output.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(output.relativePath).toBe(freeformFigureRelativePath(output.objectID, output.revisionID))
    expect(output.alt).toBe("Custom SVG figure")
    expect(output.markdown).toContain(
      `/api/objects/freeform-figure/${output.objectID}/raw?directory=`,
    )
    expect(svg).toContain("<svg")
    expect(svg).toContain("</svg>")
    expect(svg).toContain("<path")
    expect(svg).toContain('data-buddy-text-halo="true"')
    expect(svg).toContain("paint-order:stroke fill")
  })

  test("rejects malformed SVG with a compilation-level error", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      renderFreeformFigure(project.path, {
        source: "<svg><g></svg>",
      }),
    ).rejects.toBeInstanceOf(FreeformFigureRenderError)
  })

  test("strips executable SVG content before serving the stored object", async () => {
    await using project = await tmpdir({ git: true })

    const rendered = await renderFreeformFigure(project.path, {
      source: [
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 40 20">',
        '  <script>alert("x")</script>',
        '  <image href="https://example.com/evil.png" x="0" y="0" width="10" height="10" />',
        '  <use href="#safe-shape" x="0" y="0" />',
        '  <defs><circle id="safe-shape" cx="10" cy="10" r="5" /></defs>',
        '  <text x="20" y="12">ok</text>',
        "</svg>",
      ].join("\n"),
    })

    const filepath = freeformFigureFile(project.path, rendered.objectID, rendered.revisionID)
    const svg = await fs.readFile(filepath, "utf8")

    expect(svg).not.toContain("<script")
    expect(svg).not.toContain("onload=")
    expect(svg).not.toContain("https://example.com/evil.png")
    expect(svg).toContain('<use href="#safe-shape"')
  })

  test("tool metadata references only the rendered freeform figure object", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderFreeformFigure = requireTool(tools, "render_freeform_figure")

        return renderFreeformFigure.execute(
          baseFreeformFigureInput(),
          createToolContext({
            sessionID: "ses_math",
            messageID: "msg_math",
            agent: "buddy",
          }),
        )
      },
    })

    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const ref = requireFreeformFigureRef(objectResult)
    const revisionID = requireRevisionID(ref)

    expect(ref.objectID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    requireFreeformFigureData(objectResult)
    const indexResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}`,
    )
    const indexBody: unknown = await indexResponse.json()
    expect(indexBody).toMatchObject({
      objects: [{ objectID: ref.objectID, kind: BUDDY_OBJECT_KINDS.freeformFigure }],
    })
    expect(JSON.stringify(indexBody)).not.toContain('"kind":"media-presentation"')
  })
})
