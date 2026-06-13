import { describe, expect, test } from "bun:test"
import { ulid } from "ulid"
import { renderGeometryFigure } from "../../src/learning/features/figure-rendering/geometry/render-figure"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

function routeFigureInput() {
  return {
    spec: {
      canvas: {
        width: 220,
        height: 180,
      },
      points: [
        { id: "A", x: 30, y: 150, label: "A" },
        { id: "B", x: 30, y: 40, label: "B" },
        { id: "C", x: 180, y: 150, label: "C" },
      ],
      segments: [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "A", to: "C" },
      ],
      markers: [{ type: "right-angle" as const, at: "A", alongA: "B", alongB: "C" }],
    },
  }
}

describe("figure routes", () => {
  test("serves stored figures as same-origin SVG assets", async () => {
    await using project = await tmpdir({ git: true })
    const rendered = await renderGeometryFigure(project.path, routeFigureInput())

    const response = await app.request(rendered.url)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    await expect(response.text()).resolves.toContain("<svg")
  })

  test("returns 404 for missing figures", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/artifacts/figure/${ulid()}/raw?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(404)
  })

  test("rejects invalid figure ids safely", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/artifacts/figure/not-a-valid-id/raw?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(400)
  })
})
