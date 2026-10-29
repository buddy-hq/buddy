import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRuntimeHarness, scenario, transcript } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => { api = await createRuntimeHarness() })
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

describe("Events port", () => {
  test("SSE orders message and part snapshots before deltas and seals the assistant before idle", async () => {
    const session = await api.create()
    await using events = await api.events()
    await api.promptAsync(session.id, scenario({ kind: "reply", text: "Streamed answer" }))
    await events.idle(session.id)
    const projected = events.seen.filter((event) => event.payload.type.startsWith("message.") || event.payload.type === "session.status").map(transcript)
    const delta = projected.find((event) => event.type === "message.part.delta" && event.properties.sessionID === session.id)
    if (delta?.type !== "message.part.delta") throw new Error("Missing streamed delta")
    const firstDelta = projected.indexOf(delta)
    expect(projected.slice(0, firstDelta).some((event) => event.type === "message.updated" && event.properties.info.id === delta.properties.messageID)).toBe(true)
    expect(projected.slice(0, firstDelta).some((event) => event.type === "message.part.updated" && event.properties.part.id === delta.properties.partID)).toBe(true)
    expect(projected.filter((event) => event.type === "message.part.delta" && event.properties.partID === delta.properties.partID).map((event) => event.type === "message.part.delta" ? event.properties.delta : "").join("")).toBe("Streamed answer")
    const terminal = projected.find((event) => event.type === "message.updated" && event.properties.info.id === delta.properties.messageID && event.properties.info.time.completed !== undefined)
    expect(terminal).toBeDefined()
    expect(projected.some((event) => event.type === "message.part.updated" && event.properties.part.type === "text" && event.properties.part.id === delta.properties.partID && event.properties.part.text === "Streamed answer")).toBe(true)
    expect(projected.at(-1)).toMatchObject({ type: "session.status", properties: { sessionID: session.id, status: { type: "idle" } } })
    expect((await api.messages(session.id)).at(-1)?.info).toMatchObject({ finish: "stop", time: { completed: expect.any(Number) } })
  })

  test("a client joining a busy turn receives hydrated message parts and terminal state", async () => {
    const session = await api.create()
    const gate = api.gate()
    try {
      await api.promptAsync(session.id, scenario({ kind: "pause", key: gate.key, text: "Reconnected answer" }))
      await gate.entered
      await using events = await api.events()
      gate.release()
      await events.idle(session.id)
      const parts = events.seen.filter((event) => event.payload.type === "message.part.updated").map(transcript)
      expect(parts.some((event) => event.type === "message.part.updated" && event.properties.part.type === "text" && event.properties.part.text === "Working on the request.")).toBe(true)
      expect(parts.some((event) => event.type === "message.part.updated" && event.properties.part.type === "tool" && event.properties.part.state.status === "completed")).toBe(true)
      expect(parts.some((event) => event.type === "message.part.updated" && event.properties.part.type === "text" && event.properties.part.text === "Reconnected answer")).toBe(true)
      expect(events.seen.filter((event) => event.payload.type === "message.updated").map(transcript).some((event) => event.type === "message.updated" && event.properties.info.sessionID === session.id && event.properties.info.role === "assistant" && event.properties.info.finish === "stop" && event.properties.info.time.completed !== undefined)).toBe(true)
    } finally { gate.release() }
  })

  test("title changes and turn completion are visible to subscribers and survive a fresh read", async () => {
    const session = await api.create()
    await using events = await api.events()
    await api.json(`/session/${session.id}`, { method: "PATCH", body: JSON.stringify({ title: "Changed title" }) })
    const renamed = transcript(await events.until((event) => event.payload.type === "session.updated" && JSON.stringify(event.payload.properties).includes("Changed title")))
    expect(renamed).toMatchObject({ type: "session.updated", properties: { info: { id: session.id, title: "Changed title" } } })
    await api.promptAsync(session.id, scenario({ kind: "reply", text: "Turn finished" }))
    await events.idle(session.id)
    const busy = events.seen.findIndex((event) => event.payload.type === "session.status" && JSON.stringify(event.payload.properties).includes('"busy"'))
    expect(busy).toBeGreaterThanOrEqual(0)
    expect(await api.session(session.id)).toMatchObject({ title: "Changed title" })
    expect((await api.messages(session.id)).at(-1)?.info).toMatchObject({ finish: "stop", time: { completed: expect.any(Number) } })
  })
})
