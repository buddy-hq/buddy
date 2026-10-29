import { expect, test } from "bun:test"
import { Schema } from "effect"
import z from "zod"
import { BuddyEvent, TranscriptEvent } from "@buddy/transcript-contract/event"
import { createConfigConformanceHarness } from "./harness-config"
import { createToolInputProvider } from "./tool-input-provider"

async function observe(response: Response) {
  expect(response.status).toBe(200)
  const body = response.body
  if (!body) throw new Error("Missing event stream")
  const reader = body.getReader()
  const seen: TranscriptEvent[] = []
  const decoder = new TextDecoder()
  let buffer = ""
  async function next() {
    for (;;) {
      const boundary = buffer.indexOf("\n\n")
      if (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
        if (data) return Schema.decodeUnknownSync(BuddyEvent)(JSON.parse(data))
        continue
      }
      const read = await reader.read()
      if (read.done) throw new Error("Event stream ended before the tool settled")
      buffer += decoder.decode(read.value, { stream: true })
    }
  }
  while ((await next()).payload.type !== "server.connected") {}
  return {
    seen,
    async until(matches: (event: TranscriptEvent) => boolean) {
      for (;;) {
        const raw = await next()
        if (!raw.payload.type.startsWith("message.") && raw.payload.type !== "session.status") continue
        const event = Schema.decodeUnknownSync(TranscriptEvent)(raw.payload)
        seen.push(event)
        if (matches(event)) return event
      }
    },
    async [Symbol.asyncDispose]() { await reader.cancel() },
  }
}

test.each([
  { tool: "whiteboard_create_view", transport: "http" as const },
  { tool: "whiteboard_read_context", transport: "http" as const },
  { tool: "whiteboard_create_view", transport: "websocket" as const },
])("native $transport tool input delivery for $tool", async ({ tool, transport }) => {
  const first = { type: "rectangle", id: "first", x: 0, y: 0, width: 100, height: 80 }
  const second = { type: "rectangle", id: "second", x: 120, y: 0, width: 100, height: 80 }
  const raw = JSON.stringify({
    objectAction: "update", objectID: "00000000000000000000000000", boardAction: "continue_current_board",
    elements: JSON.stringify([first, second]),
  })
  const boundary = raw.indexOf("},{") + 1
  expect(boundary).toBeGreaterThan(0)
  const prefix = raw.slice(0, boundary)
  using provider = createToolInputProvider({ tool, transport, chunks: [prefix, raw.slice(boundary, boundary + 5), raw.slice(boundary + 5)] })
  await using harness = await createConfigConformanceHarness()
  const notebook = await harness.notebook("input-streaming", provider.config)
  const session = await notebook.json("/session", z.object({ id: z.string() }), { body: { title: "Input streaming", agent: "buddy" } })
  await using events = await observe(await notebook.request("/event"))
  const gate = provider
  try {
    expect((await notebook.request(`/session/${session.id}/prompt_async`, { body: { content: "Use the requested whiteboard tool.", persona: "buddy" } })).status).toBe(204)
    const started = await events.until((event) => event.type === "message.part.updated" && event.properties.part.sessionID === session.id && event.properties.part.type === "tool" && event.properties.part.tool === tool)
    if (started.type !== "message.part.updated" || started.properties.part.type !== "tool") throw new Error("Missing tool part")
    const partID = started.properties.part.id
    expect(started.properties.part.callID).toBe(provider.callID)
    if (transport === "websocket") expect(started.properties.part.callID).not.toBe(provider.itemID)
    const deltas = () => events.seen.flatMap((event) => event.type === "message.part.delta" && event.properties.partID === partID && event.properties.field === "state.raw" ? [event.properties.delta] : [])
    await gate.entered
    if (tool === "whiteboard_create_view") {
      await events.until((event) => event.type === "message.part.delta" && event.properties.partID === partID && event.properties.field === "state.raw")
      expect(deltas().join("")).toBe(prefix)
      expect(deltas().join("")).toContain('\\"id\\":\\"first\\"')
      expect(events.seen.some((event) => event.type === "message.part.updated" && event.properties.part.id === partID && event.properties.part.type === "tool" && event.properties.part.state.status !== "pending")).toBe(false)
    }
    gate.release()
    await events.until((event) => event.type === "session.status" && event.properties.sessionID === session.id && event.properties.status.type === "idle")
    const snapshots = events.seen.flatMap((event) => event.type === "message.part.updated" && event.properties.part.id === partID && event.properties.part.type === "tool" && event.properties.part.state.status === "pending" ? [event.properties.part.state.raw] : [])
    expect(snapshots.at(-1)).toBe(raw)
    expect(deltas().join("")).toBe(tool === "whiteboard_create_view" ? raw : "")
    let accumulated = ""
    for (const event of events.seen) {
      if (event.type === "message.part.updated" && event.properties.part.id === partID && event.properties.part.type === "tool" && event.properties.part.state.status === "pending") accumulated = event.properties.part.state.raw
      else if (event.type === "message.part.delta" && event.properties.partID === partID && event.properties.field === "state.raw") accumulated += event.properties.delta
    }
    expect(accumulated).toBe(raw)
  } finally { gate.release() }
})
