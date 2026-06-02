import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ServerProvider } from "../src/context/server"
import { setRuntimePlatform, type Platform } from "../src/context/platform"
import { startChatSync } from "../src/state/chat-sync"
import type { GlobalEvent } from "../src/state/chat-types"
import { createFetchStub } from "./test-utils"

const originalFetch = globalThis.fetch

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.headers) return new Headers(init.headers)
  if (input instanceof Request) return input.headers
  return new Headers()
}

function sseData(value: unknown) {
  return `data: ${JSON.stringify(value)}`
}

function setServerConnection(input: {
  url: string
  username?: string | null
  password?: string | null
  isSidecar: boolean
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
    isSidecar: false,
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("startChatSync fetch stream", () => {
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
      isSidecar: true,
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

  test("drops stale part deltas when a newer part update is coalesced", async () => {
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

    expect(events).toHaveLength(1)
    expect(events[0]?.payload.type).toBe("message.part.updated")
    const firstEvent = events[0]
    const firstEventPayload = firstEvent?.payload
    let partText: string | undefined
    if (firstEventPayload && "properties" in firstEventPayload) {
      partText = (firstEventPayload.properties as { part?: { text?: string } } | undefined)?.part
        ?.text
    }
    expect(partText).toBe("final")
  })

  test("keeps whiteboard raw tool deltas when a part update is coalesced", async () => {
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
                        type: "tool",
                        tool: "whiteboard_create_view",
                        state: { status: "pending", raw: "" },
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
                      field: "state.raw",
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
                        type: "tool",
                        tool: "whiteboard_create_view",
                        state: { status: "running", raw: "" },
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
      "message.part.updated",
      "message.part.delta",
    ])
    const deltaPayload = events[1]?.payload
    let field: string | undefined
    if (deltaPayload && "properties" in deltaPayload) {
      field = (deltaPayload.properties as { field?: string }).field
    }
    expect(field).toBe("state.raw")
  })

  test("keeps streaming after vendor sync payloads", async () => {
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

    expect(events.map((event) => event.payload.type)).toEqual(["sync", "message.updated"])
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
})
