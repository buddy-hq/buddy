import { describe, expect, test } from "bun:test"
import type { EventClient, OpenCodeEvent, UpstreamMessage, UpstreamSession } from "../src/gateway/client"
import { subscribeBuddyEvents } from "../src/gateway/stream"
import type { BuddyEvent } from "@buddy/transcript-contract/event"

const directory = "/workspace"
const session: UpstreamSession = {
  id: "ses_stream", projectID: "project", title: "Stream", location: { directory },
  time: { created: 1, updated: 2 }, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}

function client(message: UpstreamMessage, events: readonly OpenCodeEvent[]): EventClient {
  return {
    event: { async *subscribe() { yield* events } },
    session: { get: async () => session, message: { get: async () => message } },
    message: { list: async () => ({ data: [message], cursor: {} }) },
  }
}

describe("v2 event subscription recovery", () => {
  test("keeps a hydrated completed tool terminal while obsolete input and running events catch up", async () => {
    const message: UpstreamMessage = {
      id: "msg_tool", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" }, time: { created: 1 },
      content: [{ type: "tool", id: "call_read", name: "read", time: { created: 1, completed: 5 }, state: { status: "completed", input: { path: "note.md" }, content: [{ type: "text", text: "Note" }], metadata: {} } }],
    }
    const ref = { sessionID: session.id, assistantMessageID: message.id, id: "call_read" }
    const base = { location: { directory }, durable: { aggregateID: session.id, seq: 1, version: 1 as const }, created: 1 }
    const queued: OpenCodeEvent[] = [
      { ...base, id: "evt_start", type: "session.tool.input.started", data: { ...ref, name: "read" } },
      { id: "evt_input", created: 2, type: "session.tool.input.delta", data: { ...ref, delta: '{"path":"note.md"}' } },
      { ...base, id: "evt_input_end", durable: { ...base.durable, seq: 2 }, type: "session.tool.input.ended", data: { ...ref, text: '{"path":"note.md"}' } },
      { ...base, id: "evt_called", durable: { ...base.durable, seq: 3 }, type: "session.tool.called", data: { ...ref, input: { path: "note.md" }, executed: true } },
      { id: "evt_progress", created: 4, type: "session.tool.progress", data: { ...ref, metadata: { title: "Reading" } } },
      { ...base, id: "evt_success", durable: { ...base.durable, seq: 4, version: 2 }, type: "session.tool.success", data: { ...ref, executed: true, content: [{ type: "text", text: "Note" }], metadata: {} } },
    ]
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(message, queued), { directory })) events.push(event)
    const parts = events.filter((event) => event.payload.type === "message.part.updated").map((event) => event.payload.properties.part)
    expect(parts).toHaveLength(2)
    expect(parts).toEqual([expect.objectContaining({ state: expect.objectContaining({ status: "completed" }) }), expect.objectContaining({ state: expect.objectContaining({ status: "completed" }) })])
    expect(events.filter((event) => event.payload.type === "message.part.delta")).toHaveLength(0)
  })

  test("keeps forwarding progress for a tool hydrated while running and ignores its obsolete call event", async () => {
    const message: UpstreamMessage = {
      id: "msg_running", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" }, time: { created: 1 },
      content: [{ type: "tool", id: "call_read", name: "read", time: { created: 1, ran: 2 }, state: { status: "running", input: { path: "chapter.md" }, metadata: {} } }],
    }
    const ref = { sessionID: session.id, assistantMessageID: message.id, id: "call_read" }
    const base = { location: { directory }, durable: { aggregateID: session.id, seq: 1, version: 1 as const }, created: 1 }
    const queued: OpenCodeEvent[] = [
      { id: "evt_first_progress", created: 3, type: "session.tool.progress", data: { ...ref, metadata: { title: "Reading chapter 1", progress: 0.25 } } },
      { ...base, id: "evt_called", type: "session.tool.called", data: { ...ref, input: { path: "chapter.md" }, executed: true } },
      { id: "evt_second_progress", created: 4, type: "session.tool.progress", data: { ...ref, metadata: { title: "Reading chapter 2", progress: 0.5 } } },
      { ...base, id: "evt_success", durable: { ...base.durable, seq: 2, version: 2 }, created: 5, type: "session.tool.success", data: { ...ref, executed: true, content: [{ type: "text", text: "Chapter" }], metadata: { title: "Read chapter" } } },
    ]
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(message, queued), { directory })) events.push(event)
    const states = events.filter((event) => event.payload.type === "message.part.updated").map((event) => event.payload.properties.part).map((part) => part instanceof Object && "state" in part ? part.state : undefined)
    expect(states).toEqual([
      expect.objectContaining({ status: "running", metadata: {} }),
      expect.objectContaining({ status: "running", metadata: { title: "Reading chapter 1", progress: 0.25 } }),
      expect.objectContaining({ status: "running", metadata: { title: "Reading chapter 2", progress: 0.5 } }),
      expect.objectContaining({ status: "completed" }),
    ])
  })

  test("advances a tool hydrated while streaming its input to running", async () => {
    const message: UpstreamMessage = {
      id: "msg_streaming", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" }, time: { created: 1 },
      content: [{ type: "tool", id: "call_read", name: "read", time: { created: 1 }, state: { status: "streaming", input: '{"path":' } }],
    }
    const ref = { sessionID: session.id, assistantMessageID: message.id, id: "call_read" }
    const base = { location: { directory }, durable: { aggregateID: session.id, seq: 1, version: 1 as const }, created: 1 }
    const queued: OpenCodeEvent[] = [
      { id: "evt_input", created: 2, type: "session.tool.input.delta", data: { ...ref, delta: '{"path":' } },
      { ...base, id: "evt_called", created: 3, type: "session.tool.called", data: { ...ref, input: { path: "chapter.md" }, executed: true } },
      { id: "evt_progress", created: 4, type: "session.tool.progress", data: { ...ref, metadata: { title: "Reading" } } },
    ]
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(message, queued), { directory })) events.push(event)
    const states = events.filter((event) => event.payload.type === "message.part.updated").map((event) => event.payload.properties.part).map((part) => part instanceof Object && "state" in part ? part.state : undefined)
    expect(states).toEqual([
      expect.objectContaining({ status: "pending" }),
      expect.objectContaining({ status: "running", input: { path: "chapter.md" } }),
      expect.objectContaining({ status: "running", metadata: { title: "Reading" } }),
    ])
    expect(events.filter((event) => event.payload.type === "message.part.delta")).toHaveLength(0)
  })

  test("suppresses multiple queued fragment deltas covered by hydration and resumes after the terminal value", async () => {
    const message: UpstreamMessage = {
      id: "msg_backlog", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" },
      time: { created: 1 }, content: [{ type: "reasoning", text: "Think ahead" }, { type: "text", text: "Hello world" }],
    }
    const ref = { sessionID: session.id, assistantMessageID: message.id, ordinal: 0 }
    const base = { location: { directory }, durable: { aggregateID: session.id, seq: 1, version: 1 as const }, created: 1 }
    const queued: OpenCodeEvent[] = [
      { ...base, id: "evt_start", type: "session.text.started", data: ref },
      { id: "evt_first", created: 2, type: "session.text.delta", data: { ...ref, delta: "Hello " } },
      { id: "evt_second", created: 3, type: "session.text.delta", data: { ...ref, delta: "world" } },
      { id: "evt_think", created: 4, type: "session.reasoning.delta", data: { ...ref, delta: "Think ahead" } },
      { ...base, id: "evt_end", durable: { ...base.durable, seq: 3 }, type: "session.text.ended", data: { ...ref, text: "Hello world" } },
      { ...base, id: "evt_new", durable: { ...base.durable, seq: 4 }, type: "session.text.started", data: { ...ref, ordinal: 1 } },
      { id: "evt_fresh", created: 5, type: "session.text.delta", data: { ...ref, ordinal: 1, delta: " Fresh" } },
    ]
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(message, queued), { directory })) events.push(event)
    expect(events.filter((event) => event.payload.type === "message.part.delta").map((event) => event.payload.properties.delta)).toEqual([" Fresh"])
    expect(events.filter((event) => event.payload.type === "session.resync")).toHaveLength(1)
    expect(events.filter((event) => event.payload.type === "message.part.updated").map((event) => event.payload.properties.part)).toContainEqual(expect.objectContaining({ text: "Hello world" }))
  })

  test("hydrates a missing streaming part without duplicating text already committed upstream", async () => {
    const message: UpstreamMessage = {
      id: "msg_stream", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" },
      time: { created: 1 }, content: [{ type: "text", text: "Complete" }],
    }
    const delta: OpenCodeEvent = { id: "evt_delta", created: 2, type: "session.text.delta", data: { sessionID: session.id, assistantMessageID: message.id, ordinal: 0, delta: "Complete" } }
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(message, [delta]), { directory })) events.push(event)
    expect(events.map((event) => event.payload.type)).toEqual(["session.resync", "session.updated", "message.updated", "message.part.updated"])
    expect(events.at(-1)?.payload.properties.part).toMatchObject({ type: "text", text: "Complete" })

    const empty: UpstreamMessage = { ...message, content: [{ type: "text", text: "" }] }
    const recovered: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(client(empty, [delta]), { directory })) recovered.push(event)
    expect(recovered.at(-1)?.payload).toMatchObject({ type: "message.part.delta", properties: { field: "text", delta: "Complete" } })
  })

  test("passes permission events through the separately owned permission gateway", async () => {
    const message: UpstreamMessage = { id: "msg_unused", type: "synthetic", text: "Notice", time: { created: 1 } }
    const event: OpenCodeEvent = { id: "evt_permission", created: 2, type: "permission.replied", data: { sessionID: session.id, requestID: "permission", reply: "once" } }
    const result: BuddyEvent[] = []
    for await (const mapped of subscribeBuddyEvents(client(message, [event]), { directory })) result.push(mapped)
    expect(result).toEqual([{ directory, payload: { type: "permission.replied", properties: event.data } }])
  })
})
