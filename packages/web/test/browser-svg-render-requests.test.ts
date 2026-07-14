import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"
import {
  BrowserSvgRenderRequestExecutor,
  readBrowserSvgRenderRequestEvent,
  type BrowserSvgRenderCompletion,
  type BrowserSvgRenderRequest,
  type BrowserSvgRenderRequestDependencies,
} from "../src/lib/browser-svg-render-requests"

const DIRECTORY = "/tmp/buddy-browser-svg-renders"
const SOURCE = "CCO"
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex")
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'

function ignorePendingRequests(_requests: BrowserSvgRenderRequest[]): void {
  return undefined
}

function renderRequest(
  overrides: Partial<BrowserSvgRenderRequest> = {},
): BrowserSvgRenderRequest {
  return {
    version: 1,
    requestID: "svg_render_test",
    directory: DIRECTORY,
    sourceHash: SOURCE_HASH,
    format: "smiles",
    source: SOURCE,
    expiresAt: Date.now() + 30_000,
    ...overrides,
  }
}

function createDependencies(input?: {
  render?: BrowserSvgRenderRequestDependencies["render"]
  pending?: BrowserSvgRenderRequest[]
  listPending?: BrowserSvgRenderRequestDependencies["listPending"]
}) {
  const completions: Array<{
    requestID: string
    completion: BrowserSvgRenderCompletion
  }> = []
  let renderCount = 0
  let listCount = 0
  const dependencies: BrowserSvgRenderRequestDependencies = {
    now: () => Date.now(),
    hashSource: async (source) => createHash("sha256").update(source).digest("hex"),
    render: async (request) => {
      renderCount += 1
      return input?.render
        ? input.render(request)
        : {
            svg: SAFE_SVG,
            warnings: ["One unspecified stereocenter."],
          }
    },
    complete: async (completion) => {
      completions.push({
        requestID: completion.requestID,
        completion: completion.completion,
      })
      return { status: "completed" }
    },
    listPending: async (directory) => {
      listCount += 1
      return input?.listPending ? input.listPending(directory) : (input?.pending ?? [])
    },
  }
  return {
    dependencies,
    completions,
    listCount: () => listCount,
    renderCount: () => renderCount,
  }
}

describe("browser SVG render requests", () => {
  test("reads a bounded render notification from a vendor global event", () => {
    const request = renderRequest()
    expect(
      readBrowserSvgRenderRequestEvent({
        id: "evt_test",
        type: "svg.render_request",
        properties: { requestID: request.requestID },
      }),
    ).toBe(request.requestID)
    expect(
      readBrowserSvgRenderRequestEvent({
        type: "svg.render_request",
        properties: { requestID: "" },
      }),
    ).toBeUndefined()
  })

  test("coalesces active work and remembers completed request identities without retaining SVGs", async () => {
    const fixture = createDependencies()
    const executor = new BrowserSvgRenderRequestExecutor(fixture.dependencies)
    const request = renderRequest()

    await executor.handle(request)
    await executor.handle(request)

    expect(fixture.renderCount()).toBe(1)
    expect(fixture.completions).toHaveLength(1)
    expect(fixture.completions[0]).toEqual({
      requestID: request.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: SAFE_SVG,
        warnings: ["One unspecified stereocenter."],
      },
    })
  })

  test("recovers pending requests after a connection is established", async () => {
    const request = renderRequest({ requestID: "svg_render_recovered" })
    const fixture = createDependencies({ pending: [request] })
    const executor = new BrowserSvgRenderRequestExecutor(fixture.dependencies)

    await executor.synchronize(DIRECTORY)

    expect(fixture.renderCount()).toBe(1)
    expect(fixture.completions.map((entry) => entry.requestID)).toEqual([
      "svg_render_recovered",
    ])
  })

  test("coalesces recovery notifications received before a scan starts", async () => {
    let releasePendingList: (requests: BrowserSvgRenderRequest[]) => void =
      ignorePendingRequests
    const pendingList = new Promise<BrowserSvgRenderRequest[]>((resolve) => {
      releasePendingList = resolve
    })
    const fixture = createDependencies({ listPending: () => pendingList })
    const executor = new BrowserSvgRenderRequestExecutor(fixture.dependencies)

    const first = executor.synchronize(DIRECTORY)
    const second = executor.synchronize(DIRECTORY)
    await Promise.resolve()
    expect(fixture.listCount()).toBe(1)
    releasePendingList([])
    await Promise.all([first, second])
    expect(fixture.listCount()).toBe(1)

    await executor.synchronize(DIRECTORY)
    expect(fixture.listCount()).toBe(2)
  })

  test("scans again when a request arrives while the previous render is active", async () => {
    const firstRequest = renderRequest({ requestID: "svg_render_first" })
    const secondSource = "CCC"
    const secondRequest = renderRequest({
      requestID: "svg_render_second",
      source: secondSource,
      sourceHash: createHash("sha256").update(secondSource).digest("hex"),
    })
    const firstRender = Promise.withResolvers<void>()
    const firstRenderStarted = Promise.withResolvers<void>()
    let pendingScan = 0
    const fixture = createDependencies({
      listPending: async () => {
        pendingScan += 1
        if (pendingScan === 1) return [firstRequest]
        if (pendingScan === 2) return [secondRequest]
        return []
      },
      render: async (request) => {
        if (request.source === firstRequest.source) {
          firstRenderStarted.resolve()
          await firstRender.promise
        }
        return { svg: SAFE_SVG, warnings: [] }
      },
    })
    const executor = new BrowserSvgRenderRequestExecutor(fixture.dependencies)

    const firstSynchronization = executor.synchronize(DIRECTORY)
    await firstRenderStarted.promise
    expect(fixture.renderCount()).toBe(1)
    const followUpSynchronization = executor.synchronize(DIRECTORY)
    firstRender.resolve()
    await Promise.all([firstSynchronization, followUpSynchronization])

    expect(fixture.listCount()).toBe(2)
    expect(fixture.renderCount()).toBe(2)
    expect(fixture.completions.map((entry) => entry.requestID)).toEqual([
      firstRequest.requestID,
      secondRequest.requestID,
    ])
  })

  test("returns a bounded failure without trusting a mismatched source hash", async () => {
    const renderFailure = createDependencies({
      render: async () => {
        throw new Error("invalid chemistry source")
      },
    })
    const failureExecutor = new BrowserSvgRenderRequestExecutor(renderFailure.dependencies)
    await failureExecutor.handle(renderRequest())
    expect(renderFailure.completions[0]?.completion).toEqual({
      outcome: "failed",
      sourceHash: SOURCE_HASH,
      error: "invalid chemistry source",
    })

    const mismatch = createDependencies()
    const mismatchExecutor = new BrowserSvgRenderRequestExecutor(mismatch.dependencies)
    await expect(
      mismatchExecutor.handle(renderRequest({ sourceHash: "0".repeat(64) })),
    ).rejects.toThrow("failed source verification")
    expect(mismatch.renderCount()).toBe(0)
    expect(mismatch.completions).toHaveLength(0)
  })
})
