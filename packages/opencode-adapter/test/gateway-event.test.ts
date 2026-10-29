import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { OpenCodeEvent, SessionMessageAssistant, SessionMessageAssistantTool } from "@opencode/client"
import { Part, Message } from "@buddy/transcript-contract/message"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { createEventTranslator } from "../src/gateway/event"
import { toBuddyMessage } from "../src/gateway/message"
import { OpenCode } from "@opencode/client"
import type { OpenCodeHost } from "../src/host"
import { createEvents } from "../src/runtime/events"

const sessionID = "ses_gateway"
const assistantMessageID = "msg_assistant"
const directory = "/workspace"
const tokens = { input: 12, output: 3, reasoning: 1, cache: { read: 2, write: 0 } }

function base(seq: number) {
  return { id: `evt_${seq}`, created: seq, location: { directory }, durable: { aggregateID: sessionID, seq, version: 1 as const } }
}
function step(): Extract<OpenCodeEvent, { type: "session.step.started" }> {
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
  test.each(["inactivity", "user"] as const)("preserves the %s interruption reason", async (reason) => {
    const event: OpenCodeEvent = {
      ...base(2),
      type: "session.execution.interrupted", data: { sessionID, reason },
    }
    const translated = createEventTranslator({ directory }).translate(event).events
    expect(translated).toEqual([
      ...(reason === "inactivity" ? [{ directory, payload: { type: "session.stopped", properties: { sessionID, reason: "inactivity" } } }] : []),
      { directory, payload: { type: "session.status", properties: { sessionID, status: { type: "idle" } } } },
      { directory, payload: { type: "session.resync", properties: { sessionID } } },
    ])

    const client = OpenCode.make({ baseUrl: "http://events.test" })
    const host: OpenCodeHost = {
      ...client,
      sessions: client.session, events: client.event,
      plugin: Object.assign(async () => {}, client.plugin),
      async close() {}, async [Symbol.asyncDispose]() {},
      event: { ...client.event, async *subscribe() { yield event } },
    }
    const signals = []
    for await (const signal of createEvents(host, {}).signals({})) signals.push(signal)
    expect(signals).toEqual([{ type: "turn.finished", sessionID, outcome: "interrupted", reason }])
  })

  test("forwards MCP status changes for the directory without a session ID", () => {
    const translator = createEventTranslator({ directory })
    const result = translator.translate({
      id: "evt_mcp_status",
      created: 1,
      location: { directory },
      type: "mcp.status.changed",
      data: { server: "server" },
    })

    expect(result.events).toEqual([
      { directory, payload: { type: "mcp.status.changed", properties: { server: "server" } } },
    ])
  })

  test("returns to busy when a retry resumes on the same assistant and streams its answer", () => {
    const { apply, output } = translationRun()
    apply({ ...base(2), type: "session.retry.scheduled", data: { sessionID, assistantMessageID, attempt: 1, at: 10, error: { type: "provider.failed", message: "Unavailable" } } })
    apply({ ...step(), ...base(3) })
    apply({ ...base(4), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
    apply({ id: "evt_answer", created: 5, type: "session.text.delta", data: { sessionID, assistantMessageID, ordinal: 0, delta: "Answer" } })
    apply({ ...base(5), type: "session.text.ended", data: { sessionID, assistantMessageID, ordinal: 0, text: "Answer" } })
    expect(output.filter((event) => event.payload.type === "session.status").slice(-2).map((event) => event.payload.properties.status)).toMatchObject([{ type: "retry" }, { type: "busy" }])
    expect(emittedParts(output).at(-1)).toMatchObject({ messageID: assistantMessageID, type: "text", text: "Answer" })
  })

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
    const failed = apply({ ...base(7), durable: { aggregateID: sessionID, seq: 7, version: 2 }, type: "session.tool.failed", data: { sessionID, assistantMessageID, id: "call_failed", executed: false, error: { type: "permission.rejected", message: "Use another command" } } })
    expect(emittedParts(failed.events)[0]).toMatchObject({ tool: "shell", state: { status: "error", error: "Use another command", outcome: { type: "rejected", message: "Use another command" } }, metadata: { buddy: { presentation: { outcome: { type: "neutral", reason: "permission-denied" } } } } })
  })

  test("keeps normalized tool details and positions identical in live, history and hydrated transcripts", () => {
    const cases: readonly {
      readonly name: string
      readonly directory: string
      readonly input: Extract<SessionMessageAssistantTool["state"], { status: "completed" }>["input"]
      readonly metadata: Extract<SessionMessageAssistantTool["state"], { status: "running" }>["metadata"]
      readonly change?: object
      readonly pending?: object
      readonly progress?: object
      readonly completed?: object
      readonly filesChanged?: boolean
      readonly output?: string
    }[] = [
      { name: "edit", directory, input: { path: "a.ts", oldString: "old", newString: "new" }, metadata: { files: [{ file: "a.ts", status: "modified", patch: "@@ formatted", additions: 1, deletions: 1 }] }, filesChanged: true, change: { path: "/workspace/a.ts", relativePath: "a.ts", kind: "update", patch: "@@ formatted" } },
      { name: "write", directory: "C:\\workspace", input: { path: "a.ts", content: "new content" }, metadata: {}, filesChanged: true, change: { path: "C:\\workspace\\a.ts", relativePath: "a.ts", content: "new content" } },
      { name: "shell", directory, input: { command: "bun run build", description: "Build" }, metadata: { output: "Building" }, filesChanged: true, pending: { shell: { command: "bun run build" } }, progress: { shell: { command: "bun run build", output: "Building" } }, completed: { shell: { command: "bun run build", output: "Saved" } } },
      { name: "todowrite", directory, input: { todos: [{ content: "Ship", status: "running", priority: "high" }] }, metadata: { todos: [] }, pending: { todos: [{ text: "Ship", status: "in_progress", priority: "high" }] }, progress: { todos: [] }, completed: { todos: [] } },
      { name: "question", directory, input: { questions: [{ question: "Which?", options: [{ label: "A", description: "First" }] }] }, metadata: { answers: [["A"]] }, pending: { questions: [{ text: "Which?", options: [{ label: "A", description: "First" }] }] }, progress: { questions: [{ text: "Which?", answers: ["A"] }] }, completed: { questions: [{ text: "Which?", answers: ["A"] }] } },
      { name: "skill", directory, input: { name: "input-name" }, metadata: { name: "display-name" }, pending: { summary: { subject: "input-name" } }, progress: { summary: { subject: "display-name" } }, completed: { summary: { subject: "display-name" }, skillContent: "Instructions" }, output: '<skill_content name="display-name">\nInstructions\n</skill_content>' },
      { name: "webfetch", directory, input: { url: "https://example.test", format: "text" }, metadata: {}, pending: { summary: { subject: "https://example.test", args: [{ name: "format", value: "text" }] } }, completed: { summary: { subject: "https://example.test", args: [{ name: "format", value: "text" }] } } },
    ]
    for (const entry of cases) {
      const translator = createEventTranslator({ directory: entry.directory })
      const apply = (event: OpenCodeEvent) => translator.translate({ ...event, location: { directory: entry.directory } })
      apply(step())
      apply({ ...base(2), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } })
      const started = apply({ ...base(3), type: "session.tool.input.started", data: { sessionID, assistantMessageID, id: "file_call", name: entry.name } })
      const raw = JSON.stringify(entry.input)
      const delta = apply({ id: "evt_file_input", created: 3, type: "session.tool.input.delta", data: { sessionID, assistantMessageID, id: "file_call", delta: raw } })
      expect(delta.events[0]?.payload.properties.partID).toBe(emittedParts(started.events)[0]?.id)
      expect(delta.events[0]?.payload.properties).toMatchObject({ field: "state.raw", delta: raw })
      if (entry.pending) expect(emittedParts(delta.events)[0]).toMatchObject({ state: { status: "pending", ...entry.pending } })
      apply({ ...base(4), type: "session.tool.input.ended", data: { sessionID, assistantMessageID, id: "file_call", text: raw } })
      const running = apply({ ...base(5), type: "session.tool.called", data: { sessionID, assistantMessageID, id: "file_call", input: entry.input, executed: true } })
      expect(emittedParts(running.events)[0]).toMatchObject({ position: 1, state: { filesChanged: false } })
      const progress = apply({ id: "evt_file_preview", created: 5, type: "session.tool.progress", data: { sessionID, assistantMessageID, id: "file_call", metadata: entry.metadata } })
      if (entry.change) expect(emittedParts(progress.events)[0]).toMatchObject({ state: { fileChanges: [entry.change] } })
      if (entry.progress) expect(emittedParts(progress.events)[0]).toMatchObject({ state: entry.progress })
      const text = entry.output ?? "Saved"
      const completed = apply({ ...base(6), durable: { aggregateID: sessionID, seq: 6, version: 2 }, type: "session.tool.success", data: { sessionID, assistantMessageID, id: "file_call", executed: true, metadata: entry.metadata, content: [{ type: "text", text }] } })
      const history: SessionMessageAssistant = {
        id: assistantMessageID, type: "assistant", agent: "buddy", model: { providerID: "provider", id: "model" }, time: { created: 1 },
        content: [{ type: "text", text: "" }, { type: "tool", id: "file_call", name: entry.name, time: { created: 3, ran: 5, completed: 6 }, state: { status: "completed", input: entry.input, metadata: entry.metadata, content: [{ type: "text", text }] } }],
      }
      const mapped = toBuddyMessage(history, { sessionID, directory: entry.directory })?.parts[1]
      if (!mapped) throw new Error("File tool fixture must map")
      const live = emittedParts(completed.events)[0]
      expect(live).toMatchObject({ position: 1, state: { filesChanged: entry.filesChanged ?? false, ...entry.completed } })
      if (entry.change) expect(live).toMatchObject({ state: { fileChanges: [entry.change] } })
      expect(live).toEqual(mapped)
      const hydrated = createEventTranslator({ directory: entry.directory }).seed(sessionID, history, entry.directory, true)
      expect(emittedParts(hydrated)[1]).toEqual(mapped)
    }
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
