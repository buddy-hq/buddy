import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { OpenCodeEvent, SessionMessageAssistant } from "@opencode/client"
import { Part, Message } from "@buddy/transcript-contract/message"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { createEventTranslator } from "../src/gateway/event"
import { toBuddyMessage } from "../src/gateway/message"

const sessionID = "ses_gateway"
const assistantMessageID = "msg_assistant"
const directory = "/workspace"
const tokens = { input: 12, output: 3, reasoning: 1, cache: { read: 2, write: 0 } }

function base(seq: number) {
  return { id: `evt_${seq}`, created: seq, location: { directory }, durable: { aggregateID: sessionID, seq, version: 1 as const } }
}
function step(): OpenCodeEvent {
  return { ...base(1), type: "session.step.started", data: { sessionID, assistantMessageID, agent: "buddy", model: { providerID: "provider", id: "model" }, started: 1 } }
}
function emittedParts(events: readonly BuddyEvent[]) {
  return events.filter((event) => event.payload.type === "message.part.updated").map((event) => Schema.decodeUnknownSync(Part)(event.payload.properties.part))
}

function translationRun() {
  const translator = createEventTranslator({ directory })
  const output: BuddyEvent[] = []
  const apply = (event: OpenCodeEvent) => {
    const result = translator.translate(event)
    output.push(...result.events)
    return result
  }
  apply(step())
  return { translator, output, apply }
}

describe("v2 gateway streaming", () => {
  test("agrees with history IDs when text and reasoning ordinals differ from content positions", () => {
    const { apply, output } = translationRun()
    apply({ ...base(2), type: "session.reasoning.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
    apply({ id: "evt_rd", created: 3, type: "session.reasoning.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Think" } })
    apply({ ...base(3), type: "session.reasoning.ended", data: { sessionID, assistantMessageID, ordinal: 0, text: "Thinking" } })
    apply({ ...base(4), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
    const delta = apply({ id: "evt_td", created: 4, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Ans" } })
    expect(delta.events[0]?.payload).toMatchObject({ type: "message.part.delta", properties: { field: "text", delta: "Ans" } })
    apply({ ...base(5), type: "session.text.ended", data: { sessionID, assistantMessageID, ordinal: 0, text: "Answer" } })
    apply({ ...base(6), type: "session.step.ended", data: { sessionID, assistantMessageID, cost: 0.1, tokens, finish: "stop" } })
    const history: SessionMessageAssistant = { id: assistantMessageID, type: "assistant", agent: "buddy", model: { providerID: "provider", id: "model" }, time: { created: 1, completed: 6 }, content: [{ type: "reasoning", text: "Thinking", time: { created: 2, completed: 3 } }, { type: "text", text: "Answer" }], cost: 0.1, tokens, finish: "stop" }
    const mapped = toBuddyMessage(history, { directory, sessionID })
    if (!mapped) throw new Error("Assistant fixture must map")
    expect(emittedParts(output).slice(-2)).toEqual([...mapped.parts])
    const terminal = output.findLast((event) => event.payload.type === "message.updated")
    expect(Schema.decodeUnknownSync(Message)(terminal?.payload.properties.info)).toEqual(mapped.info)
  })

  test("streams native whiteboard input as state.raw and projects running, progress, completed and error states", () => {
    const { apply, output } = translationRun()
    apply({ ...base(2), type: "session.tool.input.started", data: { sessionID, assistantMessageID, id: "call_board", name: "whiteboard_create_view" } })
    const delta = apply({ id: "evt_input", created: 2, type: "session.tool.input.delta", data: { sessionID, assistantMessageID, id: "call_board", delta: '{"elements":[' } })
    expect(delta.events[0]?.payload.properties).toMatchObject({ field: "state.raw", delta: '{"elements":[' })
    apply({ ...base(3), type: "session.tool.input.ended", data: { sessionID, assistantMessageID, id: "call_board", text: '{"elements":[]}' } })
    apply({ ...base(4), type: "session.tool.called", data: { sessionID, assistantMessageID, id: "call_board", input: { elements: [] }, executed: true } })
    apply({ id: "evt_progress", created: 4, type: "session.tool.progress", data: { sessionID, assistantMessageID, id: "call_board", metadata: { revision: 1 } } })
    apply({ ...base(5), durable: { aggregateID: sessionID, seq: 5, version: 2 }, type: "session.tool.success", data: { sessionID, assistantMessageID, id: "call_board", content: [{ type: "text", text: "Created" }], executed: true, metadata: { revision: 2 } }, })
    const parts = emittedParts(output)
    expect(parts.map((part) => part.type === "tool" ? part.state.status : undefined)).toEqual(["pending", "pending", "running", "running", "completed"])
    expect(new Set(parts.map((part) => part.id)).size).toBe(1)
    expect(parts.at(-1)).toMatchObject({ state: { output: "Created", metadata: { revision: 2 }, time: { start: 4, end: 5 } }, metadata: { buddy: { presentation: { phase: "completed" } } } })
    apply({ ...base(6), type: "session.tool.input.started", data: { sessionID, assistantMessageID, id: "call_failed", name: "shell" } })
    const failed = apply({ ...base(7), durable: { aggregateID: sessionID, seq: 7, version: 2 }, type: "session.tool.failed", data: { sessionID, assistantMessageID, id: "call_failed", executed: false, error: { type: "tool.execution", message: "Failed" } } })
    expect(emittedParts(failed.events)[0]).toMatchObject({ tool: "shell", state: { status: "error", error: "Failed" } })
  })

  test("maps execution lifecycle, synthetic notices and connection resets", () => {
    const { apply, translator } = translationRun()
    expect(apply({ ...base(2), type: "session.execution.started", data: { sessionID } }).events[0]?.payload.properties.status).toEqual({ type: "busy" })
    expect(apply({ ...base(3), type: "session.execution.succeeded", data: { sessionID } }).events[0]?.payload.properties.status).toEqual({ type: "idle" })
    expect(apply({ ...base(4), type: "session.execution.failed", data: { sessionID, error: { type: "provider.failed", message: "Unavailable" } } }).events.map((event) => event.payload.type)).toEqual(["session.error", "session.status", "session.resync"])
    expect(apply({ ...base(5), type: "session.execution.interrupted", data: { sessionID, reason: "user" } }).events[0]?.payload.properties.status).toEqual({ type: "idle" })
    const notice = apply({ ...base(6), type: "session.synthetic", data: { sessionID, text: "Finished", metadata: { source: "shell", state: "completed" } } })
    expect(emittedParts(notice.events)[0]).toMatchObject({ type: "notice", messageID: "msg_6", text: "Shell completed" })
    expect(translator.translate({ id: "evt_connect", type: "server.connected", data: {} }).events[0]?.payload.type).toBe("server.connected")
    const gap = apply({ id: "evt_missed", created: 9, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Missed" } })
    expect(gap.reload).toEqual({ sessionID, messageID: assistantMessageID })
    expect(gap.events[0]?.payload.type).toBe("session.resync")
  })

  test("accepts public sequence gaps from private events, ignores duplicates and recovers evicted transcript state", () => {
    const { apply, translator } = translationRun()
    const gap = apply({ ...base(3), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
    expect(gap.reload).toBeUndefined()
    expect(gap.events[0]?.payload).toMatchObject({ type: "message.part.updated", properties: { part: { type: "text", text: "" } } })
    const delta = apply({ id: "evt_after_private", created: 4, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Still streaming" } })
    expect(delta.events[0]?.payload).toMatchObject({ type: "message.part.delta", properties: { delta: "Still streaming" } })
    expect(apply({ ...base(3), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } }).events).toEqual([])
    for (let index = 0; index < 40; index += 1) translator.seed(sessionID, { id: `msg_cached_${index}`, type: "synthetic", text: "Notice", time: { created: index } })
    const evicted = translator.translate({ id: "evt_delta", created: 50, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Late" } })
    expect(evicted.reload?.messageID).toBe(assistantMessageID)
  })

  test("keeps cache seeds isolated by session and recovers after oversized input", () => {
    const { apply, translator } = translationRun()
    apply({ ...base(2), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
    translator.seed("ses_fork", { id: assistantMessageID, type: "assistant", agent: "buddy", model: { providerID: "provider", id: "model" }, time: { created: 1 }, content: [{ type: "text", text: "Inherited" }] })
    expect(apply({ id: "evt_delta", created: 3, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Original" } }).reload).toBeUndefined()
    const end = apply({ ...base(3), type: "session.text.ended", data: { sessionID, assistantMessageID, ordinal: 0, text: "Original" } })
    expect(emittedParts(end.events)[0]).toMatchObject({ sessionID, text: "Original" })
    const large = apply({ id: "evt_large", created: 4, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "界".repeat(400_000) } })
    expect(large.reload).toEqual({ sessionID, messageID: assistantMessageID })
    expect(large.events[0]?.payload.type).toBe("session.resync")
  })
})
