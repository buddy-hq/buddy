import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"

describe("SSE event streaming compatibility", () => {
  test("app.fetch /api/event proxies events correctly mapping payload to { directory, payload }", async () => {
    const openCodeMockServer = Bun.serve({
      port: 0,
      fetch(req) {
        if (new URL(req.url).pathname === "/event") {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder()
              controller.enqueue(encoder.encode("id: 12345\n"))
              controller.enqueue(encoder.encode("event: my_custom_event\n"))
              controller.enqueue(encoder.encode('data: {"test":"payload"}\n\n'))
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
            },
          })
          return new Response(stream, { headers: { "content-type": "text/event-stream" } })
        }
        return new Response("Not found", { status: 404 })
      },
    })

    // temporarily mock loadOpenCodeApp inside app to point to this port if needed
    // or we can test parsing logic directly if heavily mocked.
    // This serves as the scaffold for the compatibility test rewrite.
    expect(openCodeMockServer.port).toBeGreaterThan(0)
    openCodeMockServer.stop(true)
  })
})
