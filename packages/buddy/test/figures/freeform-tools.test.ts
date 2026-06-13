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
import { FreeformFigureRenderError } from "../../src/learning/features/figure-rendering/freeform/service/render"
import { renderFreeformFigure } from "../../src/learning/features/figure-rendering/freeform/service/render"
import { RenderFreeformFigureOutputSchema } from "../../src/learning/features/figure-rendering/freeform/types"
import type { RenderFreeformFigureInput } from "../../src/learning/features/figure-rendering/freeform/tools/render-freeform-figure"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

function freeformFigureFile(directory: string, artifactID: string): string {
  return ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.freeformFigure,
    artifactID,
    ARTIFACT_CONTENT_FILES.figureSvg,
  )
}

function freeformFigureRelativePath(artifactID: string): string {
  return `${ArtifactPath.relativeArtifactDirectory(
    ARTIFACT_KINDS.freeformFigure,
    artifactID,
  )}/${ARTIFACT_CONTENT_FILES.figureSvg}`
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
  test("renders valid unrestricted SVG into a stable artifact", async () => {
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

    const payload = RenderFreeformFigureOutputSchema.parse(JSON.parse(result.output))
    const filepath = freeformFigureFile(project.path, payload.artifactID)
    const svg = await fs.readFile(filepath, "utf8")

    expect(payload.repairAttempts).toBe(0)
    expect(payload.artifactID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(payload.relativePath).toBe(freeformFigureRelativePath(payload.artifactID))
    expect(payload.alt).toBe("Custom SVG figure")
    expect(payload.markdown).toContain(
      `/api/artifacts/freeform-figure/${payload.artifactID}/raw?directory=`,
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

  test("strips executable SVG content before serving the stored artifact", async () => {
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

    const filepath = freeformFigureFile(project.path, rendered.artifactID)
    const svg = await fs.readFile(filepath, "utf8")

    expect(svg).not.toContain("<script")
    expect(svg).not.toContain("onload=")
    expect(svg).not.toContain("https://example.com/evil.png")
    expect(svg).toContain('<use href="#safe-shape"')
  })

  test("tool metadata references only the rendered freeform figure artifact", async () => {
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

    const metadataValue = RenderFreeformFigureOutputSchema.parse(result.metadata?.value)

    expect(result.metadata?.artifact).toBe("RenderFreeformFigureOutput")
    expect(metadataValue.relativePath).toMatch(
      /^\.buddy\/artifacts\/freeform-figure\/[0-9A-HJKMNP-TV-Z]{26}\/figure\.svg$/,
    )
    const indexResponse = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}`,
    )
    const indexBody: unknown = await indexResponse.json()
    expect(indexBody).toMatchObject({
      artifacts: [{ artifactID: metadataValue.artifactID, kind: "freeform-figure" }],
    })
    expect(JSON.stringify(indexBody)).not.toContain('"kind":"media-presentation"')
  })
})
