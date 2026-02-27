import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ServerProvider } from "../src/context/server"
import { setRuntimePlatform, type Platform } from "../src/context/platform"
import { startChatSync } from "../src/state/chat-sync"
import type { GlobalEvent } from "../src/state/chat-types"

const originalFetch = globalThis.fetch

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
      "data: {\"directory\":\"/repo\",\"payload\":{\"type\":\"message.updated\",\"properties\":{\"info\":{\"id\":\"m1\",",
      "\"sessionID\":\"s1\",\"role\":\"assistant\",\"time\":{\"created\":1}}}}}\r\n\r\n",
    ]

    globalThis.fetch = (async (input, init) => {
      receivedPath = typeof input === "string" ? input : input.url
      const headers = new Headers(init?.headers)
      receivedAuth = headers.get("authorization") ?? ""
      receivedAccept = headers.get("accept") ?? ""
      receivedDirectory = headers.get("x-buddy-directory") ?? ""

      const body = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk))
          }
          setTimeout(() => {
            controller.close()
          }, 50)
        },
      })

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    }) as typeof fetch

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
    globalThis.fetch = (async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                "data: {\"directory\":\"/repo\",\"payload\":{\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"id\":\"p1\",\"messageID\":\"m1\",\"sessionID\":\"s1\",\"type\":\"text\",\"text\":\"first\"}}}}",
                "",
                "data: {\"directory\":\"/repo\",\"payload\":{\"type\":\"message.part.delta\",\"properties\":{\"sessionID\":\"s1\",\"messageID\":\"m1\",\"partID\":\"p1\",\"field\":\"text\",\"delta\":\" stale\"}}}",
                "",
                "data: {\"directory\":\"/repo\",\"payload\":{\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"id\":\"p1\",\"messageID\":\"m1\",\"sessionID\":\"s1\",\"type\":\"text\",\"text\":\"final\"}}}}",
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
    }) as typeof fetch

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
    expect((events[0]?.payload.properties as { part?: { text?: string } }).part?.text).toBe("final")
  })
})
