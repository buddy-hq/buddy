import { describe, expect, test } from "bun:test"
import type { EventClient, OpenCodeEvent } from "@buddy/opencode-adapter/gateway/client"
import { createBuddyEventStreamResponse, normalizeBuddyStreamEvent } from "../../src/http/opencode-event-stream"
import { publishGlobalEvent, subscribeGlobalEvent } from "../../src/events/buddy-event-bus"

function client(events: readonly OpenCodeEvent[]): EventClient {
  return {
    event: { async *subscribe() { yield* events } },
    session: { async get() { throw new Error("Unexpected session read") }, message: { async get() { throw new Error("Unexpected message read") } } },
    message: { async list() { throw new Error("Unexpected history read") } },
  }
}

function watcher(directory: string, file: string) {
  return { directory, payload: { type: "file.watcher.updated", properties: { file, event: "change" } } }
}

describe("v2 transcript HTTP stream", () => {
  test("multiplexes the real Buddy event bus with host SSE and removes its listener on cancellation", async () => {
    const pendingClient: EventClient = {
      ...client([]),
      event: { async *subscribe(options) {
        yield { id: "evt_connected", type: "server.connected", data: {} }
        await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }))
      } },
    }
    let delivered = 0
    const response = createBuddyEventStreamResponse({
      client: pendingClient, directory: "/workspace",
      globalEvents: { subscribe(listener) { return subscribeGlobalEvent((event) => { delivered += 1; listener(event) }) } },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    const decode = new TextDecoder()
    expect(decode.decode((await reader.read()).value)).toContain('"type":"server.connected"')
    publishGlobalEvent({ directory: "/elsewhere", payload: { type: "notes.library.updated", properties: { private: true } } })
    publishGlobalEvent({ directory: "/workspace", payload: { type: "notes.library.updated", properties: { revision: 1 } } })
    const frame = decode.decode((await reader.read()).value)
    expect(frame).toContain('"type":"notes.library.updated"')
    expect(frame).toContain('"revision":1')
    expect(frame).not.toContain("private")
    expect(delivered).toBe(2)
    await reader.cancel()
    publishGlobalEvent({ directory: "/workspace", payload: { type: "notes.library.updated", properties: {} } })
    expect(delivered).toBe(2)
  })

  test("keeps POSIX, Windows drive and UNC paths relative and drops paths outside the workspace", () => {
    expect(normalizeBuddyStreamEvent(watcher("/workspace", "/workspace/notes/a.md"), "/workspace")?.payload.properties.relativePath).toBe("notes/a.md")
    expect(normalizeBuddyStreamEvent(watcher("C:\\workspace", "C:\\workspace\\notes\\a.md"), "C:\\workspace")?.payload.properties.relativePath).toBe("notes/a.md")
    expect(normalizeBuddyStreamEvent(watcher("\\\\server\\share\\workspace", "\\\\server\\share\\workspace\\notes\\a.md"), "\\\\server\\share\\workspace")?.payload.properties.relativePath).toBe("notes/a.md")
    expect(normalizeBuddyStreamEvent(watcher("/workspace", "/elsewhere/a.md"), "/workspace")).toBeUndefined()
    expect(normalizeBuddyStreamEvent(watcher("C:\\workspace", "D:\\elsewhere\\a.md"), "C:\\workspace")).toBeUndefined()
  })

  test("composes translated v2 events with Buddy notices and disposes subscriptions", async () => {
    let released = false
    const response = createBuddyEventStreamResponse({
      client: client([
        { id: "evt_connected", type: "server.connected", data: {} },
        { id: "evt_notice", created: 2, location: { directory: "/workspace" }, durable: { aggregateID: "ses_notice", seq: 1, version: 1 }, type: "session.synthetic", data: { sessionID: "ses_notice", text: "Finished", metadata: { source: "shell", state: "completed" } } },
      ]),
      directory: "/workspace",
      buddyEvents: { initialEvents: [{ directory: "/workspace", payload: { type: "notes.library.updated", properties: {} } }], subscribe: () => () => { released = true } },
    })
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    const text = await response.text()
    expect(text).toContain('"type":"notes.library.updated"')
    expect(text).toContain('"type":"server.connected"')
    expect(text).toContain('"kind":"synthetic"')
    expect(text).toContain('"text":"Shell completed"')
    expect(released).toBe(true)
  })

  test("maps filesystem.changed to the Buddy watcher contract and isolates directories", async () => {
    const response = createBuddyEventStreamResponse({ client: client([
      { id: "evt_file", created: 1, type: "filesystem.changed", location: { directory: "/workspace" }, data: { file: "/workspace/new.md", event: "add" } },
      { id: "evt_external", created: 2, type: "filesystem.changed", location: { directory: "/elsewhere" }, data: { file: "/elsewhere/private.md", event: "change" } },
    ]), directory: "/workspace" })
    const text = await response.text()
    expect(text).toContain('"type":"file.watcher.updated"')
    expect(text).toContain('"relativePath":"new.md"')
    expect(text).not.toContain("private.md")
  })

  test("cancelling a reader aborts only its subscription and releases Buddy event listeners", async () => {
    let signal: AbortSignal | undefined
    let released = false
    const pendingClient: EventClient = {
      ...client([]),
      event: { async *subscribe(options) {
        signal = options?.signal
        yield { id: "evt_connected", type: "server.connected", data: {} }
        await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }))
      } },
    }
    const response = createBuddyEventStreamResponse({ client: pendingClient, directory: "/workspace", buddyEvents: { subscribe: () => () => { released = true } } })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected event stream body")
    await reader.read()
    await reader.cancel()
    expect(signal?.aborted).toBe(true)
    expect(released).toBe(true)
  })
})
