import { describe, expect, test } from "bun:test"
import type { OpenCodeEvent, SessionMessageAssistant } from "@opencode/client"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { createEventTranslator } from "../src/gateway/event"

type Translator = ReturnType<typeof createEventTranslator>
type Call = {
  readonly sessionID: string
  readonly assistantMessageID: string
  readonly id: string
  readonly location: { readonly directory: string; readonly workspaceID?: string }
}

const directory = "/workspace"

function call(sessionID = "ses_board", id = "call_board", path = directory, workspaceID?: string): Call {
  return { sessionID, assistantMessageID: "msg_tool", id, location: { directory: path, workspaceID } }
}

function step(translator: Translator, ref: Call) {
  return translator.translate({
    id: "evt_step", created: 1, location: ref.location, type: "session.step.started",
    durable: { aggregateID: ref.sessionID, seq: 1, version: 1 },
    data: { sessionID: ref.sessionID, assistantMessageID: ref.assistantMessageID, agent: "buddy", model: { providerID: "provider", id: "model" }, started: 1 },
  })
}

function started(ref: Call, seq = 2): Extract<OpenCodeEvent, { type: "session.tool.input.started" }> {
  return {
    id: `evt_started_${seq}`, created: seq, location: ref.location, type: "session.tool.input.started",
    durable: { aggregateID: ref.sessionID, seq, version: 1 },
    data: { sessionID: ref.sessionID, assistantMessageID: ref.assistantMessageID, id: ref.id, name: "whiteboard_create_view" },
  }
}

function carrier(ref: Call, delta: string): OpenCodeEvent {
  return { id: "evt_carrier", created: 3, location: ref.location, type: "rpc.buddy.runtime.toolInputDelta", data: { sessionID: ref.sessionID, callID: ref.id, delta } }
}

function ended(ref: Call, text: string): Extract<OpenCodeEvent, { type: "session.tool.input.ended" }> {
  return {
    id: "evt_ended", created: 4, location: ref.location, type: "session.tool.input.ended",
    durable: { aggregateID: ref.sessionID, seq: 4, version: 1 },
    data: { sessionID: ref.sessionID, assistantMessageID: ref.assistantMessageID, id: ref.id, text },
  }
}

function deltas(events: readonly BuddyEvent[]) {
  return events.filter((event) => event.payload.type === "message.part.delta").map((event) => ({
    directory: event.directory, sessionID: event.payload.properties.sessionID, messageID: event.payload.properties.messageID,
    partID: event.payload.properties.partID, field: event.payload.properties.field, delta: event.payload.properties.delta,
  }))
}

function parts(events: readonly BuddyEvent[]) {
  return events.filter((event) => event.payload.type === "message.part.updated").map((event) => event.payload.properties.part)
}

function hydratedMessage(ref: Call, raw: string): SessionMessageAssistant {
  return {
    id: ref.assistantMessageID, type: "assistant", agent: "buddy", model: { providerID: "provider", id: "model" }, time: { created: 1 },
    content: [{ type: "tool", id: ref.id, name: "whiteboard_create_view", time: { created: 2 }, state: { status: "streaming", input: raw } }],
  }
}

describe("tool input carrier", () => {
  test("flushes early fragments after the started snapshot once and continues the same part", () => {
    const translator = createEventTranslator({ directory })
    const ref = call()
    expect(translator.translate(carrier(ref, '{"elements":')).events).toEqual([])
    expect(translator.translate(carrier(ref, "[")).events).toEqual([])
    step(translator, ref)
    const initial = translator.translate(started(ref))
    expect(initial.events.map((event) => event.payload.type)).toEqual(["message.part.updated", "message.part.delta"])
    expect(parts(initial.events)).toMatchObject([{ callID: ref.id, state: { status: "pending", raw: "" } }])
    expect(deltas(initial.events)).toMatchObject([{ sessionID: ref.sessionID, messageID: ref.assistantMessageID, field: "state.raw", delta: '{"elements":[' }])
    expect(translator.translate(started(ref), true).events).toEqual([])
    const live = translator.translate(carrier(ref, "]}"))
    expect(deltas(live.events)).toMatchObject([{ partID: deltas(initial.events)[0]?.partID, field: "state.raw", delta: "]}" }])
    expect(parts(live.events)).toMatchObject([{ state: { raw: '{"elements":[]}' } }])
    expect(parts(translator.translate(ended(ref, '{"elements":[]}')).events)).toMatchObject([{ state: { raw: '{"elements":[]}' } }])
  })

  test("keeps ended input authoritative before the native tool advances to running", () => {
    const translator = createEventTranslator({ directory })
    const ref = call()
    step(translator, ref)
    translator.translate(started(ref))
    translator.translate(carrier(ref, '{"elements":['))
    expect(parts(translator.translate(ended(ref, '{"elements":[]}')).events)).toMatchObject([{ state: { status: "pending", raw: '{"elements":[]}' } }])
    expect(translator.translate(carrier(ref, "duplicate")).events).toEqual([])
    expect(translator.translate({ id: "evt_native_late", created: 5, location: ref.location, type: "session.tool.input.delta", data: { sessionID: ref.sessionID, assistantMessageID: ref.assistantMessageID, id: ref.id, delta: "duplicate" } }).events).toEqual([])
    const final = translator.translate({ ...ended(ref, '{"elements":[]}'), durable: { aggregateID: ref.sessionID, seq: 5, version: 1 } })
    expect(parts(final.events)).toMatchObject([{ state: { raw: '{"elements":[]}' } }])
  })

  test("flushes a reused call ID's early fragments into the later message once", () => {
    const translator = createEventTranslator({ directory })
    const previous = call("ses_board", "call_0")
    translator.seed(previous.sessionID, {
      ...hydratedMessage(previous, ""), time: { created: 1, completed: 2 },
      content: [{ type: "tool", id: previous.id, name: "whiteboard_create_view", time: { created: 1, completed: 2 }, state: { status: "completed", input: { elements: [] }, content: [{ type: "text", text: "Created" }], metadata: {} } }],
    }, directory, true)
    const next = { ...previous, assistantMessageID: "msg_next" }
    expect(translator.translate(carrier(next, '{"elements":')).events).toEqual([])
    expect(translator.translate(carrier(next, "[")).events).toEqual([])
    step(translator, next)
    const initial = translator.translate(started(next))
    expect(deltas(initial.events)).toMatchObject([{ messageID: next.assistantMessageID, delta: '{"elements":[' }])
    expect(translator.translate(started(next), true).events).toEqual([])
    expect(parts(translator.translate(carrier(next, "]}")).events)).toMatchObject([{ messageID: next.assistantMessageID, state: { raw: '{"elements":[]}' } }])
  })

  test("correlates separate sessions sharing a message ID and leaves unrelated calls untouched", () => {
    const translator = createEventTranslator({ directory })
    const first = call("ses_first", "call_first")
    const second = call("ses_second", "call_second")
    translator.translate(carrier(second, "second"))
    step(translator, first)
    translator.translate(started(first))
    step(translator, second)
    const secondStart = translator.translate(started(second))
    expect(deltas(secondStart.events)).toMatchObject([{ sessionID: second.sessionID, messageID: second.assistantMessageID, delta: "second" }])
    expect(deltas(translator.translate(carrier(first, "first")).events)).toMatchObject([{ sessionID: first.sessionID, delta: "first" }])
    expect(parts(translator.translate(ended(first, "first")).events)).toMatchObject([{ sessionID: first.sessionID, state: { raw: "first" } }])
    expect(parts(translator.translate(ended(second, "second")).events)).toMatchObject([{ sessionID: second.sessionID, state: { raw: "second" } }])
  })

  test("isolates equal call IDs by directory and workspace before and after start", () => {
    const translator = createEventTranslator({ directory })
    const refs = [call("ses_here", "call_shared", directory, "workspace_here"), call("ses_elsewhere", "call_shared", "/elsewhere", "workspace_here"), call("ses_other_workspace", "call_shared", directory, "workspace_other")]
    for (const ref of refs) translator.translate(carrier(ref, ref.sessionID))
    for (const ref of refs) {
      step(translator, ref)
      const initial = translator.translate(started(ref))
      expect(deltas(initial.events)).toMatchObject([{ directory: ref.location.directory, sessionID: ref.sessionID, delta: ref.sessionID }])
    }
    for (const ref of refs) {
      expect(deltas(translator.translate(carrier(ref, "!")).events)).toMatchObject([{ directory: ref.location.directory, sessionID: ref.sessionID, delta: "!" }])
      expect(parts(translator.translate(ended(ref, `${ref.sessionID}!`)).events)).toMatchObject([{ sessionID: ref.sessionID, state: { raw: `${ref.sessionID}!` } }])
    }
  })

  test("isolates equal call IDs in two sessions at the same location", () => {
    const translator = createEventTranslator({ directory })
    const first = call("ses_first", "call_shared")
    const second = call("ses_second", "call_shared")
    translator.translate(carrier(first, "first"))
    translator.translate(carrier(second, "second"))
    for (const ref of [first, second]) {
      step(translator, ref)
      expect(deltas(translator.translate(started(ref)).events)).toMatchObject([{ sessionID: ref.sessionID, delta: ref === first ? "first" : "second" }])
    }
    expect(deltas(translator.translate(carrier(first, "!")).events)).toMatchObject([{ sessionID: first.sessionID, delta: "!" }])
    translator.translate(ended(first, "first!"))
    expect(translator.translate(carrier(first, "late")).events).toEqual([])
    expect(deltas(translator.translate(carrier(second, "?")).events)).toMatchObject([{ sessionID: second.sessionID, delta: "?" }])
    expect(parts(translator.translate(ended(second, "second?")).events)).toMatchObject([{ sessionID: second.sessionID, state: { raw: "second?" } }])
  })

  test("evicts the oldest unknown calls when the 64-call buffer fills", () => {
    const translator = createEventTranslator({ directory })
    for (let index = 0; index < 65; index += 1) translator.translate(carrier(call("ses_board", `call_${index}`), `fragment_${index}`))
    const oldest = call("ses_board", "call_0")
    step(translator, oldest)
    expect(deltas(translator.translate(started(oldest)).events)).toEqual([])
    const retained = call("ses_board", "call_1")
    expect(deltas(translator.translate(started(retained, 3)).events)).toMatchObject([{ delta: "fragment_1" }])
  })

  test("bounds buffered UTF-8 bytes across calls and releases bytes after flushing", () => {
    const translator = createEventTranslator({ directory })
    const oldest = call("ses_board", "call_oldest")
    const retained = call("ses_board", "call_retained")
    translator.translate(carrier(oldest, "界".repeat(200_000)))
    translator.translate(carrier(retained, "界".repeat(200_000)))
    step(translator, oldest)
    expect(deltas(translator.translate(started(oldest)).events)).toEqual([])
    expect(deltas(translator.translate(started(retained, 3)).events)).toMatchObject([{ delta: "界".repeat(200_000) }])
    const next = call("ses_next", "call_next")
    translator.translate(carrier(next, "界".repeat(200_000)))
    step(translator, next)
    expect(deltas(translator.translate(started(next)).events)).toMatchObject([{ delta: "界".repeat(200_000) }])
  })

  test("streams fresh fragments after hydrating a call whose input has not started", () => {
    const translator = createEventTranslator({ directory })
    const ref = call()
    translator.seed(ref.sessionID, hydratedMessage(ref, ""), directory, true)
    expect(translator.translate(carrier(ref, '{"elements":[')).events.length).toBeGreaterThan(0)
  })

  test("discards buffered and queued fragments covered by hydration", () => {
    const translator = createEventTranslator({ directory })
    const ref = call()
    translator.translate(carrier(ref, '{"elements":['))
    translator.seed(ref.sessionID, hydratedMessage(ref, '{"elements":['), directory, true)
    expect(translator.translate(started(ref)).events).toEqual([])
    expect(translator.translate(carrier(ref, '{"elements":[')).events).toEqual([])
    expect(parts(translator.translate(ended(ref, '{"elements":[]}')).events)).toMatchObject([{ state: { raw: '{"elements":[]}' } }])
    expect(translator.translate(carrier(ref, "duplicate")).events).toEqual([])
  })

  test("clears pre-start fragments when the connection resets", () => {
    const translator = createEventTranslator({ directory })
    const ref = call()
    translator.translate(carrier(ref, "stale"))
    translator.translate({ id: "evt_connected", type: "server.connected", data: {} })
    step(translator, ref)
    expect(deltas(translator.translate(started(ref)).events)).toEqual([])
    expect(deltas(translator.translate(carrier(ref, "fresh")).events)).toMatchObject([{ delta: "fresh" }])
  })
})
