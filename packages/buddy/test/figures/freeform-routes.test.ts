import { describe, expect, test } from "bun:test"
import { ulid } from "ulid"
import { renderFreeformFigure } from "../../src/learning/features/figure-rendering/freeform/service/render"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

function routeFigureInput() {
  return {
    source: [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">',
      '  <rect x="10" y="10" width="80" height="40" rx="6" fill="#e5e7eb" stroke="#1f2937" />',
      '  <text x="50" y="38" text-anchor="middle" font-size="14" fill="#1f2937">a² + b²</text>',
      "</svg>",
    ].join("\n"),
  }
}

describe("freeform figure routes", () => {
  test("serves stored freeform figures as same-origin SVG assets", async () => {
    await using project = await tmpdir({ git: true })
    const rendered = await renderFreeformFigure(project.path, routeFigureInput())

    const response = await app.request(rendered.url)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    await expect(response.text()).resolves.toContain("<svg")
  })

  test("returns 404 for missing freeform figures", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/artifacts/freeform-figure/${ulid()}/raw?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(404)
  })

  test("rejects invalid freeform figure ids safely", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/artifacts/freeform-figure/not-a-valid-id/raw?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(400)
  })
})
