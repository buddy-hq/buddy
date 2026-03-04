import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { FigureService } from "../src/learning/figures/service.js"
import { ensureFigureToolsRegistered } from "../src/learning/figures/tools/register.js"
import { RenderFigureOutputSchema, type RenderFigureInput } from "../src/learning/figures/types.js"
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

function baseFigureInput(): RenderFigureInput {
  return {
    kind: "geometry.v1" as const,
    alt: "Right triangle ABC",
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
      markers: [
        { type: "right-angle" as const, at: "A", alongA: "B", alongB: "C" },
      ],
    },
  }
}

describe("figure tools", () => {
  test("renders a valid geometry figure into a stable SVG artifact", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureFigureToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const renderFigure = tools.find((tool) => tool.id === "render_figure")

        expect(renderFigure).toBeDefined()

        return renderFigure!.execute(baseFigureInput(), createToolContext())
      },
    })

    const payload = RenderFigureOutputSchema.parse(JSON.parse(result.output))
    const filepath = path.join(project.path, ".buddy", "figures", `${payload.figureID}.svg`)
    const svg = await fs.readFile(filepath, "utf8")

    expect(payload.repairAttempts).toBe(0)
    expect(payload.figureID).toMatch(/^[a-f0-9]{64}$/)
    expect(payload.markdown).toContain(`/api/figures/${payload.figureID}?directory=`)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("</svg>")
    expect(svg).toContain('paint-order="stroke fill"')
    expect(svg).toContain('width="288"')
    expect(svg).toContain('height="228"')
    expect(svg).toContain('transform="translate(24, 24)"')
  })

  test("repairs removable spec issues before returning a rendered figure", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureFigureToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const renderFigure = tools.find((tool) => tool.id === "render_figure")

        expect(renderFigure).toBeDefined()

        const input = baseFigureInput()
        input.spec.points.push({ id: "A", x: 40, y: 140, label: "A2" })
        input.spec.segments?.push({ from: "A", to: "Z" })
        input.spec.markers = [{ type: "tick", from: "A", to: "Z" }]

        return renderFigure!.execute(input, createToolContext())
      },
    })

    const payload = RenderFigureOutputSchema.parse(JSON.parse(result.output))
    expect(payload.repairAttempts).toBeGreaterThan(0)

    const svg = await fs.readFile(path.join(project.path, ".buddy", "figures", `${payload.figureID}.svg`), "utf8")
    expect(svg).toContain("<svg")
  })

  test("resolves perpendicular-foot constraints so derived helper lines land exactly on the base", async () => {
    await using project = await tmpdir({ git: true })

    const rendered = await FigureService.render(project.path, {
      kind: "geometry.v1",
      alt: "Right triangle with perpendicular foot",
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

    const svg = await fs.readFile(path.join(project.path, ".buddy", "figures", `${rendered.figureID}.svg`), "utf8")
    expect(svg).toContain('x1="90" y1="40" x2="90" y2="150"')
  })
})
