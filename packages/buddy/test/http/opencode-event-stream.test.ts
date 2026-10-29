import { describe, expect, test } from "bun:test"
import type { Events } from "@buddy/agent-runtime/events"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import {
  createBuddyEventStreamResponse,
  normalizeBuddyStreamEvent,
} from "../../src/http/opencode-event-stream"
import { publishGlobalEvent, subscribeGlobalEvent } from "../../src/events/buddy-event-bus"

function stream(events: readonly BuddyEvent[]): Pick<Events, "stream"> {
  return {
    async *stream() {
      yield* events
    },
  }
}

function watcher(directory: string, file: string) {
  return {
    directory,
    payload: { type: "file.watcher.updated", properties: { file, event: "change" } },
  }
}

describe("transcript HTTP stream", () => {
  test("multiplexes the Buddy event bus with runtime events and cancels only its subscription", async () => {
    let signal: AbortSignal | undefined
    let released = false
    const response = createBuddyEventStreamResponse({
      events: {
        async *stream(input) {
          signal = input.signal
          yield {
            directory: input.directory,
            payload: { type: "server.connected", properties: {} },
          }
          await new Promise<void>((resolve) =>
            input.signal?.addEventListener("abort", () => resolve(), { once: true }),
          )
        },
      },
      directory: "/workspace",
      globalEvents: {
        subscribe(listener) {
          const unsubscribe = subscribeGlobalEvent(listener)
          return () => {
            released = true
            unsubscribe()
          }
        },
      },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    const decode = new TextDecoder()
    expect(decode.decode((await reader.read()).value)).toContain('"type":"server.connected"')
    publishGlobalEvent({
      directory: "/elsewhere",
      payload: { type: "notes.library.updated", properties: { private: true } },
    })
    publishGlobalEvent({
      directory: "/workspace",
      payload: { type: "notes.library.updated", properties: { revision: 1 } },
    })
    const frame = decode.decode((await reader.read()).value)
    expect(frame).toContain('"type":"notes.library.updated"')
    expect(frame).toContain('"revision":1')
    expect(frame).not.toContain("private")
    await reader.cancel()
    expect(signal?.aborted).toBe(true)
    expect(released).toBe(true)
  })

  test("keeps POSIX, Windows drive and UNC paths relative and drops paths outside the workspace", () => {
    expect(
      normalizeBuddyStreamEvent(watcher("/workspace", "/workspace/notes/a.md"), "/workspace")
        ?.payload.properties.relativePath,
    ).toBe("notes/a.md")
    expect(
      normalizeBuddyStreamEvent(
        watcher("C:\\workspace", "C:\\workspace\\notes\\a.md"),
        "C:\\workspace",
      )?.payload.properties.relativePath,
    ).toBe("notes/a.md")
    expect(
      normalizeBuddyStreamEvent(
        watcher("\\\\server\\share\\workspace", "\\\\server\\share\\workspace\\notes\\a.md"),
        "\\\\server\\share\\workspace",
      )?.payload.properties.relativePath,
    ).toBe("notes/a.md")
    expect(
      normalizeBuddyStreamEvent(watcher("/workspace", "/elsewhere/a.md"), "/workspace"),
    ).toBeUndefined()
    expect(
      normalizeBuddyStreamEvent(watcher("C:\\workspace", "D:\\elsewhere\\a.md"), "C:\\workspace"),
    ).toBeUndefined()
  })

  test("flushes initial Buddy notices and runtime events before releasing subscriptions", async () => {
    let released = false
    const response = createBuddyEventStreamResponse({
      events: stream([
        { directory: "/workspace", payload: { type: "server.connected", properties: {} } },
      ]),
      directory: "/workspace",
      buddyEvents: {
        initialEvents: [
          { directory: "/workspace", payload: { type: "notes.library.updated", properties: {} } },
        ],
        subscribe: () => () => {
          released = true
        },
      },
    })
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    const text = await response.text()
    expect(text).toContain('"type":"notes.library.updated"')
    expect(text).toContain('"type":"server.connected"')
    expect(released).toBe(true)
  })

  test("delivers a 6 MiB event followed by a small event without erroring an idle stream", async () => {
    const abort = new AbortController()
    const large = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(6 * 1024 * 1024) } },
    }
    const small = { directory: "/workspace", payload: { type: "session.updated", properties: {} } }
    const response = createBuddyEventStreamResponse({
      events: stream([]),
      directory: "/workspace",
      signal: abort.signal,
      buddyEvents: { initialEvents: [large, small], subscribe: () => () => {} },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    try {
      const decode = new TextDecoder()
      expect(decode.decode((await reader.read()).value)).toBe(`data: ${JSON.stringify(large)}\n\n`)
      expect(decode.decode((await reader.read()).value)).toBe(`data: ${JSON.stringify(small)}\n\n`)
      expect((await reader.read()).done).toBe(true)
    } finally {
      abort.abort()
    }
  })

  test("delivers an 80 MiB event and stays open while the reader drains", async () => {
    const abort = new AbortController()
    let signal: AbortSignal | undefined
    const large = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(80 * 1024 * 1024) } },
    }
    const response = createBuddyEventStreamResponse({
      events: {
        async *stream(input) {
          signal = input.signal
          yield {
            directory: input.directory,
            payload: { type: "server.connected", properties: {} },
          }
          await new Promise<void>((resolve) =>
            input.signal?.addEventListener("abort", () => resolve(), { once: true }),
          )
        },
      },
      directory: "/workspace",
      signal: abort.signal,
      buddyEvents: { initialEvents: [large], subscribe: () => () => {} },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    try {
      const frame = await reader.read()
      expect(frame.done).toBe(false)
      expect(frame.value?.byteLength).toBeGreaterThan(80 * 1024 * 1024)
      const following = await reader.read()
      expect(following.done).toBe(false)
      expect(new TextDecoder().decode(following.value)).toContain('"type":"server.connected"')
      expect(signal?.aborted).toBe(false)
    } finally {
      abort.abort()
    }
  })

  test("delivers two 6 MiB events pushed before the consumer reads", async () => {
    const abort = new AbortController()
    const first = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(6 * 1024 * 1024) } },
    }
    const second = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "y".repeat(6 * 1024 * 1024) } },
    }
    const response = createBuddyEventStreamResponse({
      events: stream([]),
      directory: "/workspace",
      signal: abort.signal,
      buddyEvents: { initialEvents: [first, second], subscribe: () => () => {} },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    try {
      const decode = new TextDecoder()
      expect(decode.decode((await reader.read()).value)).toBe(`data: ${JSON.stringify(first)}\n\n`)
      expect(decode.decode((await reader.read()).value)).toBe(`data: ${JSON.stringify(second)}\n\n`)
      expect((await reader.read()).done).toBe(true)
    } finally {
      abort.abort()
    }
  })

  test("stops twenty 8 MiB frames at the real-byte limit when the reader stalls", async () => {
    const large = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(8 * 1024 * 1024) } },
    }
    const stopped = Promise.withResolvers<number>()
    let produced = 0
    const response = createBuddyEventStreamResponse({
      events: {
        async *stream() {
          try {
            for (let index = 0; index < 20; index++) {
              produced++
              yield large
            }
          } finally {
            stopped.resolve(produced)
          }
        },
      },
      directory: "/workspace",
    })
    const count = await stopped.promise
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    await expect(reader.read()).rejects.toThrow("Transcript event consumer fell behind")
    expect(count).toBe(9)
  })

  test("delivers twenty 8 MiB frames when the reader keeps draining the queue", async () => {
    const large = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(8 * 1024 * 1024) } },
    }
    const response = createBuddyEventStreamResponse({
      events: stream(Array.from({ length: 20 }, () => large)),
      directory: "/workspace",
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    let received = 0
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      expect(next.value.byteLength).toBeGreaterThan(8 * 1024 * 1024)
      received++
    }
    expect(received).toBe(20)
  })

  test("errors when a consumer leaves seventeen 300 KiB events queued without reading", async () => {
    const initial = {
      directory: "/workspace",
      payload: { type: "server.connected", properties: {} },
    }
    const large = {
      directory: "/workspace",
      payload: { type: "message.part.updated", properties: { data: "x".repeat(300 * 1024) } },
    }
    const response = createBuddyEventStreamResponse({
      events: stream([]),
      directory: "/workspace",
      buddyEvents: {
        initialEvents: [initial, ...Array.from({ length: 17 }, () => large)],
        subscribe: () => () => {},
      },
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected stream body")
    await expect(reader.read()).rejects.toThrow("Transcript event consumer fell behind")
  })
})
