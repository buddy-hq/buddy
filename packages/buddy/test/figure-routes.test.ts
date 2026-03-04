import { describe, expect, test } from "bun:test"
import { FigureService } from "../src/learning/figures/service.js"
import { app } from "../src/index.ts"
import { tmpdir } from "./fixture/fixture"

function routeFigureInput() {
  return {
    kind: "geometry.v1" as const,
    alt: "Proof triangle",
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
      markers: [
        { type: "right-angle" as const, at: "A", alongA: "B", alongB: "C" },
      ],
    },
  }
}

describe("figure routes", () => {
  test("serves stored figures as same-origin SVG assets", async () => {
    await using project = await tmpdir({ git: true })
    const rendered = await FigureService.render(project.path, routeFigureInput())

    const response = await app.request(rendered.url)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    await expect(response.text()).resolves.toContain("<svg")
  })

  test("returns 404 for missing figures", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/figures/${"a".repeat(64)}?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(404)
  })

  test("rejects invalid figure ids safely", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(`/api/figures/not-a-valid-id?directory=${encodeURIComponent(project.path)}`)

    expect(response.status).toBe(400)
  })
})
