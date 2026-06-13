import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
} from "../../src/artifacts"
import { renderGeometryFigure } from "../../src/learning/features/figure-rendering/geometry/render-figure"
import { RenderFigureOutputSchema } from "../../src/learning/features/figure-rendering/geometry/types"
import type { RenderFigureInput } from "../../src/learning/features/figure-rendering/geometry/tools/render-figure"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

function figureFile(directory: string, artifactID: string): string {
  return ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.figure,
    artifactID,
    ARTIFACT_CONTENT_FILES.figureSvg,
  )
}

function figureRelativePath(artifactID: string): string {
  return `${ArtifactPath.relativeArtifactDirectory(
    ARTIFACT_KINDS.figure,
    artifactID,
  )}/${ARTIFACT_CONTENT_FILES.figureSvg}`
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
  test("renders a valid geometry figure into a stable SVG artifact", async () => {
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

    const payload = RenderFigureOutputSchema.parse(JSON.parse(result.output))
    const filepath = figureFile(project.path, payload.artifactID)
    const svg = await fs.readFile(filepath, "utf8")

    expect(payload.repairAttempts).toBe(0)
    expect(payload.artifactID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(payload.relativePath).toBe(figureRelativePath(payload.artifactID))
    expect(payload.alt).toBe("Geometry figure")
    expect(payload.markdown).toContain(`/api/artifacts/figure/${payload.artifactID}/raw?directory=`)
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

    const payload = RenderFigureOutputSchema.parse(JSON.parse(result.output))
    expect(payload.repairAttempts).toBeGreaterThan(0)

    const svg = await fs.readFile(
      figureFile(project.path, payload.artifactID),
      "utf8",
    )
    expect(svg).toContain("<svg")
  })

  test("tool metadata references only the rendered figure artifact", async () => {
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

    const metadataValue = RenderFigureOutputSchema.parse(result.metadata?.value)

    expect(result.metadata?.artifact).toBe("RenderFigureOutput")
    expect(metadataValue.relativePath).toMatch(
      /^\.buddy\/artifacts\/figure\/[0-9A-HJKMNP-TV-Z]{26}\/figure\.svg$/,
    )
    const indexResponse = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}`,
    )
    const indexBody: unknown = await indexResponse.json()
    expect(indexBody).toMatchObject({
      artifacts: [{ artifactID: metadataValue.artifactID, kind: "figure" }],
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
      figureFile(project.path, rendered.artifactID),
      "utf8",
    )
    expect(svg).toContain('x1="90" y1="40" x2="90" y2="150"')
  })
})
