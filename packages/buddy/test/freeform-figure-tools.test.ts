import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import {
  FreeformFigureRenderError,
  FreeformFigureService,
} from "../src/learning/freeform-figures/service.js"
import { ensureFreeformFigureToolsRegistered } from "../src/learning/freeform-figures/tools/register.js"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureInput } from "../src/learning/freeform-figures/types.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_math",
    messageID: "msg_math",
    agent: "math-teacher",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

function baseFreeformFigureInput(): RenderFreeformFigureInput {
  return {
    kind: "svg.v1",
    alt: "Curved proof figure",
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

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureFreeformFigureToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const renderFreeformFigure = tools.find((tool) => tool.id === "render_freeform_figure")

        expect(renderFreeformFigure).toBeDefined()

        return renderFreeformFigure!.execute(baseFreeformFigureInput(), createToolContext())
      },
    })

    const payload = RenderFreeformFigureOutputSchema.parse(JSON.parse(result.output))
    const filepath = path.join(project.path, ".buddy", "freeform-figures", `${payload.figureID}.svg`)
    const svg = await fs.readFile(filepath, "utf8")

    expect(payload.repairAttempts).toBe(0)
    expect(payload.figureID).toMatch(/^[a-f0-9]{64}$/)
    expect(payload.markdown).toContain(`/api/freeform-figures/${payload.figureID}?directory=`)
    expect(svg).toContain("<svg")
    expect(svg).toContain("</svg>")
    expect(svg).toContain("<path")
    expect(svg).toContain('data-buddy-text-halo="true"')
    expect(svg).toContain("paint-order:stroke fill")
  })

  test("rejects malformed SVG with a compilation-level error", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      FreeformFigureService.render(project.path, {
        kind: "svg.v1",
        alt: "Broken svg",
        source: "<svg><g></svg>",
      }),
    ).rejects.toBeInstanceOf(FreeformFigureRenderError)
  })

  test("strips executable SVG content before serving the stored artifact", async () => {
    await using project = await tmpdir({ git: true })

    const rendered = await FreeformFigureService.render(project.path, {
      kind: "svg.v1",
      alt: "Sanitized svg",
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

    const filepath = path.join(project.path, ".buddy", "freeform-figures", `${rendered.figureID}.svg`)
    const svg = await fs.readFile(filepath, "utf8")

    expect(svg).not.toContain("<script")
    expect(svg).not.toContain("onload=")
    expect(svg).not.toContain("https://example.com/evil.png")
    expect(svg).toContain('<use href="#safe-shape"')
  })
})
