import { afterEach, describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import {
  buildOpenCodeEventStreamRequestHeaders,
  transformOpenCodeEventStreamResponse,
} from "../../src/http/opencode-event-stream"

const BACKPRESSURE_UPSTREAM_CHUNK_COUNT = 64
const BACKPRESSURE_OBSERVATION_DELAY_MS = 10

describe("buildOpenCodeEventStreamRequestHeaders", () => {
  test("forwards inbound SSE headers and normalizes accept", () => {
    const inbound = new Headers({
      accept: "application/json",
      "last-event-id": "evt_resume_123",
      "cache-control": "no-cache",
    })

    const headers = buildOpenCodeEventStreamRequestHeaders(inbound)

    expect(headers.get("accept")).toBe("text/event-stream")
    expect(headers.get("last-event-id")).toBe("evt_resume_123")
    expect(headers.get("cache-control")).toBe("no-cache")
  })
})

afterEach(() => {
  ToolRegistry.unregisterToolUi("/tmp/buddy-event-stream", ["tool_demo"])
})

function sseResponse(body: string) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  )
}

function eventFrame(payload: unknown) {
  return ["id: evt_watcher", `data: ${JSON.stringify(payload)}`, ""].join("\n")
}

describe("transformOpenCodeEventStreamResponse", () => {
  test("adds Buddy tool UI metadata to message.part.updated frames", async () => {
    ToolRegistry.registerToolUiCatalog("/tmp/buddy-event-stream", [
      {
        id: "tool_demo",
        toolUi: {
          presentation: "hidden-summary",
          labels: {
            idle: "Hidden",
          },
        },
      },
    ])

    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: sseResponse(
        [
          "id: evt_1",
          'data: {"directory":"/tmp/buddy-event-stream","payload":{"type":"message.part.updated","part":{"id":"prt_1","sessionID":"ses_1","messageID":"msg_1","type":"tool","callID":"call_1","tool":"tool_demo","state":{"status":"pending","input":{},"raw":"{}"}},"time":1}}',
          "",
        ].join("\n"),
      ),
    })

    const text = await response.text()
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "))

    expect(dataLine).toBeDefined()
    const payload = JSON.parse((dataLine ?? "").slice("data: ".length)) as {
      payload: {
        part: {
          metadata?: {
            buddy?: {
              toolUi?: {
                presentation?: string
                labels?: {
                  idle?: string
                }
              }
            }
          }
        }
      }
    }

    expect(payload.payload.part.metadata?.buddy?.toolUi?.presentation).toBe("hidden-summary")
    expect(payload.payload.part.metadata?.buddy?.toolUi?.labels?.idle).toBe("Hidden")
  })

  test("leaves non-tool-update frames unchanged", async () => {
    const body = [
      "id: evt_2",
      'data: {"directory":"/tmp/buddy-event-stream","payload":{"type":"message.updated","info":{"id":"msg_1"}}}',
      "",
    ].join("\n")

    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: sseResponse(body),
    })

    expect(await response.text()).toBe(body)
  })

  test("adds workspace-relative paths to watcher frames", async () => {
    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: sseResponse(
        eventFrame({
          directory: "/tmp/buddy-event-stream",
          payload: {
            type: "file.watcher.updated",
            properties: {
              file: "/tmp/buddy-event-stream/src/app.ts",
              event: "unlink",
            },
          },
        }),
      ),
    })

    const text = await response.text()
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "))
    expect(dataLine).toBeDefined()
    const payload = JSON.parse((dataLine ?? "").slice("data: ".length)) as {
      payload: {
        properties?: {
          relativePath?: string
        }
      }
    }

    expect(payload.payload.properties?.relativePath).toBe("src/app.ts")
  })

  test("normalizes Windows watcher paths at the stream boundary", async () => {
    const response = transformOpenCodeEventStreamResponse({
      directory: "C:\\Users\\buddy\\project",
      response: sseResponse(
        eventFrame({
          directory: "C:\\Users\\buddy\\project",
          payload: {
            type: "file.watcher.updated",
            properties: {
              file: "C:\\Users\\buddy\\project\\docs\\intro.md",
              event: "change",
            },
          },
        }),
      ),
    })

    const text = await response.text()
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "))
    expect(dataLine).toBeDefined()
    const payload = JSON.parse((dataLine ?? "").slice("data: ".length)) as {
      payload: {
        properties?: {
          relativePath?: string
        }
      }
    }

    expect(payload.payload.properties?.relativePath).toBe("docs/intro.md")
  })

  test("does not drain the transformed upstream while the downstream is paused", async () => {
    const encoder = new TextEncoder()
    let upstreamPullCount = 0
    const upstreamResponse = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          upstreamPullCount += 1
          controller.enqueue(encoder.encode(`data: {"sequence":${upstreamPullCount}}\n\n`))
          if (upstreamPullCount === BACKPRESSURE_UPSTREAM_CHUNK_COUNT) {
            controller.close()
          }
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )

    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: upstreamResponse,
      buddyEvents: {
        subscribe: () => () => undefined,
      },
    })

    await Bun.sleep(BACKPRESSURE_OBSERVATION_DELAY_MS)

    expect(upstreamPullCount).toBeLessThan(BACKPRESSURE_UPSTREAM_CHUNK_COUNT)
    await response.body?.cancel()
  })
})
