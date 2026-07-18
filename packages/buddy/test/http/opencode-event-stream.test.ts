import { afterEach, describe, expect, test } from "bun:test"
import type { EventMessagePartUpdated } from "@opencode-ai/sdk/v2"
import type { BuddyGlobalEvent } from "@buddy/opencode-adapter/global-event"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { defineToolPresentation } from "@buddy/opencode-adapter/tool-presentation"
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
  ToolRegistry.unregisterToolPresentations("/tmp/buddy-event-stream", ["tool_demo"])
})

const DEMO_PRESENTATION = defineToolPresentation({
  archetype: "activity",
  icon: "tool",
  renderer: "generic",
  layoutRole: "activity",
  phases: {
    pending: { action: "Preparing demo" },
    running: { action: "Running demo" },
    completed: { action: "Ran demo" },
    error: { action: "Failed to run demo" },
  },
  summary: {
    category: "demo",
    pending: "Preparing demo",
    running: "Running demo",
    completed: "Ran demo",
    error: "Failed to run demo",
  },
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
  test("adds the resolved Buddy presentation snapshot to tool-part frames", async () => {
    ToolRegistry.registerToolPresentationCatalog("/tmp/buddy-event-stream", [
      {
        id: "tool_demo",
        presentation: DEMO_PRESENTATION,
      },
    ])

    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: sseResponse(
        eventFrame({
          directory: "/tmp/buddy-event-stream",
          payload: {
            id: "evt_1",
            type: "message.part.updated",
            properties: {
              sessionID: "ses_1",
              part: {
                id: "prt_1",
                sessionID: "ses_1",
                messageID: "msg_1",
                type: "tool",
                callID: "call_1",
                tool: "tool_demo",
                state: { status: "pending", input: {}, raw: "{}" },
              },
              time: 1,
            },
          },
        } satisfies BuddyGlobalEvent & {
          directory: string
          payload: EventMessagePartUpdated
        }),
      ),
    })

    const text = await response.text()
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "))

    expect(dataLine).toBeDefined()
    const payload: unknown = JSON.parse((dataLine ?? "").slice("data: ".length))

    expect(payload).toMatchObject({
      payload: {
        properties: {
          part: {
            metadata: {
              buddy: {
                presentation: {
                  archetype: "activity",
                  phase: "pending",
                  action: "Preparing demo",
                  icon: "tool",
                },
              },
            },
          },
        },
      },
    })
  })

  test("keeps runtime-defined MCP tool frames visible without a registered descriptor", async () => {
    const response = transformOpenCodeEventStreamResponse({
      directory: "/tmp/buddy-event-stream",
      response: sseResponse(
        eventFrame({
          directory: "/tmp/buddy-event-stream",
          payload: {
            id: "evt_mcp",
            type: "message.part.updated",
            properties: {
              sessionID: "ses_mcp",
              part: {
                id: "prt_mcp",
                sessionID: "ses_mcp",
                messageID: "msg_mcp",
                type: "tool",
                callID: "call_mcp",
                tool: "runtime-server_private_snake_case_tool",
                state: { status: "pending", input: {}, raw: "{}" },
              },
              time: 1,
            },
          },
        } satisfies BuddyGlobalEvent & {
          directory: string
          payload: EventMessagePartUpdated
        }),
      ),
    })

    const text = await response.text()
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "))

    expect(dataLine).toBeDefined()
    const payload: unknown = JSON.parse((dataLine ?? "").slice("data: ".length))
    expect(payload).toMatchObject({
      payload: {
        properties: {
          part: {
            metadata: {
              buddy: {
                presentation: {
                  archetype: "activity",
                  phase: "pending",
                  action: "Preparing connected tool",
                  icon: "tool",
                },
              },
            },
          },
        },
      },
    })
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
