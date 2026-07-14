import { createHash } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { app } from "../../src/index"
import { CHEMISTRY_SVG_MAX_BYTES } from "../../src/chemistry/limits"
import { browserSvgRenderRequests } from "../../src/learning/features/svg-rendering/service/browser-render-requests"
import {
  BrowserSvgRenderCompletionResponseSchema,
  BrowserSvgRenderRequestSchema,
} from "../../src/learning/features/svg-rendering/service/contracts"
import { tmpdir } from "../helpers/tmpdir"

const SOURCE = "CCO"
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex")
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'

afterEach(() => {
  browserSvgRenderRequests.reset()
})

function svgRenderingRequest(
  directory: string,
  pathname: string,
  init?: RequestInit,
) {
  return app.request(`/api/svg-rendering${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directory,
      ...init?.headers,
    },
  })
}

describe("SVG rendering routes", () => {
  test("recovers and completes a browser-owned render request", async () => {
    await using project = await tmpdir({ git: true })
    const enqueued = browserSvgRenderRequests.enqueue({
      directory: project.path,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })

    const listResponse = await svgRenderingRequest(project.path, "/browser-requests")
    expect(listResponse.status).toBe(200)
    const listed = BrowserSvgRenderRequestSchema.array().parse(await listResponse.json())
    expect(listed).toEqual([enqueued.request])

    const completeResponse = await svgRenderingRequest(
      project.path,
      `/browser-requests/${encodeURIComponent(enqueued.request.requestID)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          outcome: "rendered",
          sourceHash: SOURCE_HASH,
          svg: SAFE_SVG,
          warnings: [],
        }),
      },
    )
    expect(completeResponse.status).toBe(200)
    expect(
      BrowserSvgRenderCompletionResponseSchema.parse(await completeResponse.json()),
    ).toEqual({ status: "completed" })
    await expect(enqueued.completion).resolves.toEqual({
      status: "completed",
      svg: SAFE_SVG,
      warnings: [],
    })
  })

  test("rejects malformed completions without consuming the pending request", async () => {
    await using project = await tmpdir({ git: true })
    const enqueued = browserSvgRenderRequests.enqueue({
      directory: project.path,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })

    const response = await svgRenderingRequest(
      project.path,
      `/browser-requests/${encodeURIComponent(enqueued.request.requestID)}/complete`,
      {
        method: "POST",
        body: "{",
      },
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid JSON body." })
    expect(browserSvgRenderRequests.listPending(project.path)).toEqual([enqueued.request])
  })

  test("rejects decoded SVG output beyond the renderer limit", async () => {
    await using project = await tmpdir({ git: true })
    const enqueued = browserSvgRenderRequests.enqueue({
      directory: project.path,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })

    const response = await svgRenderingRequest(
      project.path,
      `/browser-requests/${encodeURIComponent(enqueued.request.requestID)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          outcome: "rendered",
          sourceHash: SOURCE_HASH,
          svg: `<svg>${"x".repeat(CHEMISTRY_SVG_MAX_BYTES)}</svg>`,
          warnings: [],
        }),
      },
    )

    expect(response.status).toBe(400)
    expect(browserSvgRenderRequests.listPending(project.path)).toEqual([enqueued.request])
  })
})
