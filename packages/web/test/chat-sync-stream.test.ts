import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ServerProvider } from "../src/context/server"
import { setRuntimePlatform, type Platform } from "../src/context/platform"
import { fenceChatSyncSession, startChatSync } from "../src/state/chat-sync"
import {
  MESSAGE_PART_DELTA_EVENT_TYPE,
  MESSAGE_PART_UPDATED_EVENT_TYPE,
  STREAMING_PART_RAW_FIELD,
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "../src/state/chat-stream-event-buffer"
import type { GlobalEvent } from "../src/state/chat-types"
import { createFetchStub } from "./test-utils"

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalDateNow = Date.now
const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view"

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.headers) return new Headers(init.headers)
  if (input instanceof Request) return input.headers
  return new Headers()
}

function sseData(value: unknown) {
  return `data: ${JSON.stringify(value)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function eventPartState(event: GlobalEvent | undefined) {
  const payload = event?.payload
  if (!payload || !("properties" in payload)) return undefined

  const part = payload.properties.part
  if (!isRecord(part)) return undefined

  const state = part.state
  return isRecord(state) ? state : undefined
}

function setServerConnection(input: {
  url: string
  username?: string | null
  password?: string | null
  isEmbeddedBackend: boolean
}) {
  ServerProvider({
    value: input,
    children: null,
  })
}

beforeEach(() => {
  setRuntimePlatform({
    platform: "web",
    openLink() {},
    async restart() {},
    back() {},
    forward() {},
    async notify() {},
  } satisfies Platform)

  setServerConnection({
    url: "",
    username: null,
    password: null,
    isEmbeddedBackend: false,
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
  Date.now = originalDateNow
})

describe("startChatSync fetch stream", () => {
  test("fences only the recovered session while unrelated directory events continue", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    let streamRequests = 0
    globalThis.fetch = createFetchStub(async () => {
      streamRequests += 1
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const received: GlobalEvent[] = []
    await new Promise<void>((resolve, reject) => {
      const lifecycle: string[] = []
      let fenced = false
      const sync = startChatSync({
        directory: "/repo",
        onEvent(nextEvent) {
          received.push(nextEvent)
        },
        onStatus(status) {
          lifecycle.push(status)
          if (status !== "connected") return
          if (fenced) return
          fenced = true
          const releaseFence = fenceChatSyncSession("/repo", "s1")
          const events = [
            {
              directory: "/repo",
              payload: {
                type: "message.updated",
                properties: {
                  info: {
                    id: "stale-target",
                    sessionID: "s1",
                    role: "assistant",
                    time: { created: 1 },
                  },
                },
              },
            },
            {
              directory: "/repo",
              payload: {
                type: "message.updated",
                properties: {
                  info: {
                    id: "background-session",
                    sessionID: "s2",
                    role: "assistant",
                    time: { created: 1 },
                  },
                },
              },
            },
            {
              directory: "/repo",
              payload: {
                type: "workspace.file.updated",
                properties: { path: "notes.md" },
              },
            },
            {
              directory: "/repo",
              payload: {
                type: "bench.client_action",
                properties: { id: "bench-action" },
              },
            },
          ]
          originalSetTimeout(() => {
            for (const event of events) {
              streamController?.enqueue(
                new TextEncoder().encode(`${sseData(event)}\r\n\r\n`),
              )
            }
            originalSetTimeout(() => {
              releaseFence()
              streamController?.enqueue(
                new TextEncoder().encode(
                  `${sseData({
                    directory: "/repo",
                    payload: {
                      type: "message.updated",
                      properties: {
                        info: {
                          id: "fresh-target",
                          sessionID: "s1",
                          role: "assistant",
                          time: { created: 2 },
                        },
                      },
                    },
                  })}\r\n\r\n`,
                ),
              )
              originalSetTimeout(() => {
                sync.stop()
                expect(lifecycle).toContain("session-fence")
                expect(lifecycle).toContain("session-resume")
                resolve()
              }, 30)
            }, 30)
          }, 0)
        },
        onBufferActivity(activity) {
          lifecycle.push(activity.phase)
        },
        onError(error) {
          sync.stop()
          reject(error)
        },
      })

      originalSetTimeout(() => {
        sync.stop()
        reject(new Error(`stream recovery timed out: ${lifecycle.join(",")}`))
      }, 1_000)
    })

    expect(
      received.map((event) => {
        const payload = event.payload
        if (!("properties" in payload)) return payload.type
        const info = payload.properties.info
        return isRecord(info) && typeof info.id === "string" ? info.id : payload.type
      }),
    ).toEqual([
      "background-session",
      "workspace.file.updated",
      "bench.client_action",
      "fresh-target",
    ])
    expect(streamRequests).toBe(1)
  })

  test("streams authenticated desktop events through apiFetch", async () => {
    let receivedPath = ""
    let receivedAuth = ""
    let receivedAccept = ""
    let receivedDirectory = ""

    const chunks = [
      'data: {"directory":"/repo","payload":{"type":"message.updated","properties":{"info":{"id":"m1",',
      '"sessionID":"s1","role":"assistant","time":{"created":1}}}}}\r\n\r\n',
    ]

    globalThis.fetch = createFetchStub(async (input, init) => {
      receivedPath =
        typeof input === "string" ? input : input instanceof Request ? input.url : input.toString()
      const headers = requestHeaders(input, init)
      receivedAuth = headers.get("authorization") ?? ""
      receivedAccept = headers.get("accept") ?? ""
      receivedDirectory = headers.get("x-buddy-directory") ?? ""

      const body = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk))
          }
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    setServerConnection({
      url: "http://127.0.0.1:4000",
      username: "buddy",
      password: "secret",
      isEmbeddedBackend: true,
    })

    const event = await new Promise<GlobalEvent>((resolve, reject) => {
      const sync = startChatSync({
        directory: "/repo",
        onEvent(nextEvent) {
          sync.stop()
          resolve(nextEvent)
        },
        onError(error) {
          reject(error)
        },
      })
    })

    expect(receivedPath).toBe("http://127.0.0.1:4000/api/event?directory=%2Frepo")
    expect(receivedAccept).toBe("text/event-stream")
    expect(receivedDirectory).toBe("/repo")
    expect(receivedAuth).toBe(`Basic ${btoa("buddy:secret")}`)
    expect(event.payload.type).toBe("message.updated")
    expect(event.directory).toBe("/repo")
  })

  test("compacts text deltas superseded by the latest snapshot", async () => {
    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                'data: {"directory":"/repo","payload":{"type":"message.part.updated","properties":{"part":{"id":"p1","messageID":"m1","sessionID":"s1","type":"text","text":"first"}}}}',
                "",
                'data: {"directory":"/repo","payload":{"type":"message.part.delta","properties":{"sessionID":"s1","messageID":"m1","partID":"p1","field":"text","delta":" stale"}}}',
                "",
                'data: {"directory":"/repo","payload":{"type":"message.part.updated","properties":{"part":{"id":"p1","messageID":"m1","sessionID":"s1","type":"text","text":"final"}}}}',
                "",
                "",
              ].join("\r\n"),
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const events = await new Promise<GlobalEvent[]>((resolve) => {
      const received: GlobalEvent[] = []
      const sync = startChatSync({
        directory: "/repo",
        onEvent(event) {
          received.push(event)
        },
        onError() {},
      })

      setTimeout(() => {
        sync.stop()
        resolve(received)
      }, 40)
    })

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    const firstEventPayload = events[0]?.payload
    let partText: string | undefined
    if (firstEventPayload && "properties" in firstEventPayload) {
      partText = (firstEventPayload.properties as { part?: { text?: string } } | undefined)?.part
        ?.text
    }
    expect(partText).toBe("final")
  })

  test("preserves whiteboard raw tool deltas between snapshots", async () => {
    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                sseData({
                  directory: "/repo",
                  payload: {
                    type: "message.part.updated",
                    properties: {
                      part: {
                        id: "p1",
                        messageID: "m1",
                        sessionID: "s1",
                        type: TOOL_PART_TYPE,
                        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
                        state: { status: TOOL_STATE_PENDING_STATUS, raw: "" },
                      },
                    },
                  },
                }),
                "",
                sseData({
                  directory: "/repo",
                  payload: {
                    type: "message.part.delta",
                    properties: {
                      sessionID: "s1",
                      messageID: "m1",
                      partID: "p1",
                      field: STREAMING_PART_RAW_FIELD,
                      delta: '{"elements":"[{',
                    },
                  },
                }),
                "",
                sseData({
                  directory: "/repo",
                  payload: {
                    type: "message.part.updated",
                    properties: {
                      part: {
                        id: "p1",
                        messageID: "m1",
                        sessionID: "s1",
                        type: TOOL_PART_TYPE,
                        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
                        state: { status: TOOL_STATE_RUNNING_STATUS, raw: "" },
                      },
                    },
                  },
                }),
                "",
                "",
              ].join("\r\n"),
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const events = await new Promise<GlobalEvent[]>((resolve) => {
      const received: GlobalEvent[] = []
      const sync = startChatSync({
        directory: "/repo",
        onEvent(event) {
          received.push(event)
        },
        onError() {},
      })

      setTimeout(() => {
        sync.stop()
        resolve(received)
      }, 40)
    })

    expect(events.map((event) => event.payload.type)).toEqual([
      MESSAGE_PART_UPDATED_EVENT_TYPE,
      MESSAGE_PART_DELTA_EVENT_TYPE,
      MESSAGE_PART_UPDATED_EVENT_TYPE,
    ])
    expect(eventPartState(events[0])?.raw).toBe("")
    expect(eventPartState(events[2])?.raw).toBe("")
  })

  test("skips vendor sync payloads and keeps streaming", async () => {
    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                'data: {"directory":"/repo","payload":{"type":"sync","syncEvent":{"type":"message.updated.1","id":"evt_1","seq":0,"aggregateID":"s1","data":{"sessionID":"s1"}}}}',
                "",
                'data: {"directory":"/repo","payload":{"type":"message.updated","properties":{"info":{"id":"m1","sessionID":"s1","role":"assistant","time":{"created":1}}}}}',
                "",
                "",
              ].join("\r\n"),
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const events = await new Promise<GlobalEvent[]>((resolve, reject) => {
      const received: GlobalEvent[] = []
      const sync = startChatSync({
        directory: "/repo",
        onEvent(event) {
          received.push(event)
        },
        onError(error) {
          sync.stop()
          reject(error)
        },
      })

      setTimeout(() => {
        sync.stop()
        resolve(received)
      }, 40)
    })

    expect(events.map((event) => event.payload.type)).toEqual(["message.updated"])
  })

  test("normalizes bare event payloads from vendor-compatible streams", async () => {
    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                'data: {"type":"message.updated","properties":{"info":{"id":"m1","sessionID":"s1","role":"assistant","time":{"created":1}}}}',
                "",
                "",
              ].join("\r\n"),
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const event = await new Promise<GlobalEvent>((resolve, reject) => {
      const sync = startChatSync({
        directory: "/repo",
        onEvent(nextEvent) {
          sync.stop()
          resolve(nextEvent)
        },
        onError(error) {
          sync.stop()
          reject(error)
        },
      })
    })

    expect(event.payload.type).toBe("message.updated")
    expect(event.directory).toBe("/repo")
  })

  test("marks the stream open when the connection is established before events arrive", async () => {
    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const statuses: string[] = []
    let opened = false
    const sync = startChatSync({
      directory: "/repo",
      onEvent() {},
      onOpen() {
        opened = true
      },
      onStatus(status) {
        statuses.push(status)
      },
      onError() {},
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20)
    })
    sync.stop()

    expect(opened).toBe(true)
    expect(statuses).toContain("connected")
  })

  test("does not report stopped sdk streams as reconnect errors", async () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined

    globalThis.fetch = createFetchStub(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllerRef = controller
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const errors: unknown[] = []
    const statuses: string[] = []
    const sync = startChatSync({
      directory: "/repo",
      onEvent() {},
      onStatus(status) {
        statuses.push(status)
      },
      onError(error) {
        errors.push(error)
      },
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20)
    })
    sync.stop()
    controllerRef?.close()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(statuses).toContain("connected")
    expect(errors).toEqual([])
  })

  test("backs off reconnect attempts during persistent stream failures", async () => {
    const reconnectDelays: number[] = []
    const expectedReconnectDelays = [250, 500]

    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 250 || timeout === 500 || timeout === 1_000) {
        reconnectDelays.push(timeout)
        return originalSetTimeout(handler, 0, ...args)
      }
      return originalSetTimeout(handler, timeout, ...args)
    }) as typeof globalThis.setTimeout

    globalThis.fetch = createFetchStub(async () => {
      throw new Error("stream down")
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    await new Promise<void>((resolve, reject) => {
      let errorCount = 0
      const sync = startChatSync({
        directory: "/repo",
        onEvent() {},
        onError() {
          errorCount += 1
          if (errorCount === 3) {
            sync.stop()
            resolve()
          }
        },
      })

      originalSetTimeout(() => {
        sync.stop()
        reject(new Error("reconnect backoff timed out"))
      }, 1_000)
    })

    expect(reconnectDelays.slice(0, expectedReconnectDelays.length)).toEqual(
      expectedReconnectDelays,
    )
  })

  test("reconnects after the heartbeat timeout when a stream stalls", async () => {
    let fetchCount = 0

    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const nextTimeout = timeout === 15_000 ? 0 : timeout
      return originalSetTimeout(handler, nextTimeout, ...args)
    }) as typeof globalThis.setTimeout

    globalThis.fetch = createFetchStub(async () => {
      fetchCount += 1

      if (fetchCount === 1) {
        const body = new ReadableStream<Uint8Array>({
          start() {},
        })

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        })
      }

      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${sseData({
                directory: "/repo",
                payload: {
                  type: "message.updated",
                  properties: {
                    info: {
                      id: "m1",
                      sessionID: "s1",
                      role: "assistant",
                      time: { created: 1 },
                    },
                  },
                },
              })}\r\n\r\n`,
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const event = await new Promise<GlobalEvent>((resolve, reject) => {
      const sync = startChatSync({
        directory: "/repo",
        onEvent(nextEvent) {
          sync.stop()
          resolve(nextEvent)
        },
        onError(error) {
          sync.stop()
          reject(error)
        },
      })

      originalSetTimeout(() => {
        sync.stop()
        reject(new Error("heartbeat reconnect timed out"))
      }, 1_000)
    })

    expect(fetchCount).toBeGreaterThanOrEqual(2)
    expect(event.payload.type).toBe("message.updated")
  })

  test("reconnects when the document becomes visible after a stale stream", async () => {
    let fetchCount = 0
    let now = 1_000
    Date.now = () => now

    globalThis.fetch = createFetchStub(async () => {
      fetchCount += 1

      if (fetchCount === 1) {
        const body = new ReadableStream<Uint8Array>({
          start() {},
        })

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        })
      }

      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${sseData({
                directory: "/repo",
                payload: {
                  type: "message.updated",
                  properties: {
                    info: {
                      id: "m2",
                      sessionID: "s2",
                      role: "assistant",
                      time: { created: 2 },
                    },
                  },
                },
              })}\r\n\r\n`,
            ),
          )
          controller.close()
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    })

    setRuntimePlatform({
      platform: "desktop",
      fetch: globalThis.fetch,
      openLink() {},
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    } satisfies Platform)

    const event = await new Promise<GlobalEvent>((resolve, reject) => {
      const sync = startChatSync({
        directory: "/repo",
        onEvent(nextEvent) {
          sync.stop()
          resolve(nextEvent)
        },
        onError(error) {
          sync.stop()
          reject(error)
        },
      })

      originalSetTimeout(() => {
        now += 15_001
        document.dispatchEvent(new Event("visibilitychange"))
      }, 20)

      originalSetTimeout(() => {
        sync.stop()
        reject(new Error("visibility reconnect timed out"))
      }, 1_000)
    })

    expect(fetchCount).toBeGreaterThanOrEqual(2)
    expect(event.payload.type).toBe("message.updated")
  })
})
