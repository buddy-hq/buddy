import { afterEach, describe, expect, test } from "bun:test"
import { createExcalidrawShareLink } from "../../src/learning/features/whiteboard/service/share"
import { MAX_WHITEBOARD_PAYLOAD_BYTES } from "../../src/learning/features/whiteboard/service/payload"
import {
  WhiteboardPayloadTooLargeError,
  WhiteboardShareUploadError,
} from "../../src/learning/features/whiteboard/errors"

const originalFetch = globalThis.fetch
type FetchParameters = Parameters<typeof fetch>

function mockFetch(handler: (...args: FetchParameters) => ReturnType<typeof fetch>) {
  globalThis.fetch = Object.assign(handler, { preconnect: originalFetch.preconnect })
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("whiteboard Excalidraw share links", () => {
  test("uploads an encrypted payload and returns an Excalidraw share URL", async () => {
    let uploaded: { url: string; method?: string; bodyBytes: number } | undefined
    mockFetch(async (input, init) => {
      const body = init?.body
      uploaded = {
        url: String(input),
        method: init?.method,
        bodyBytes: body instanceof Uint8Array ? body.byteLength : 0,
      }
      return Response.json({ id: "share123", extra: "ignored" })
    })

    const result = await createExcalidrawShareLink({
      json: JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {} }),
    })

    expect(uploaded).toEqual({
      url: "https://json.excalidraw.com/api/v2/post/",
      method: "POST",
      bodyBytes: expect.any(Number),
    })
    expect(uploaded?.bodyBytes).toBeGreaterThan(0)
    expect(result.url).toStartWith("https://excalidraw.com/#json=share123,")
  })

  test("rejects oversized exports before upload", async () => {
    mockFetch(async () => {
      throw new Error("unexpected upload")
    })

    await expect(
      createExcalidrawShareLink({ json: "x".repeat(MAX_WHITEBOARD_PAYLOAD_BYTES + 1) }),
    ).rejects.toBeInstanceOf(WhiteboardPayloadTooLargeError)
  })

  test("maps upload failures to a route-safe error", async () => {
    mockFetch(async () => new Response("nope", { status: 503 }))

    await expect(
      createExcalidrawShareLink({
        json: JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {} }),
      }),
    ).rejects.toBeInstanceOf(WhiteboardShareUploadError)
  })

  test("maps malformed upload JSON to a route-safe error", async () => {
    mockFetch(async () => Response.json({ unexpected: "shape" }))

    await expect(
      createExcalidrawShareLink({
        json: JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {} }),
      }),
    ).rejects.toBeInstanceOf(WhiteboardShareUploadError)
  })
})
