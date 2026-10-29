import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createRuntimeHarness, messageText, scenario, transcript } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => { api = await createRuntimeHarness() })
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

describe("Subagents port", () => {
  test("a foreground child has its role before its first step and completes in the parent's tool part", async () => {
    const parent = await api.create({ agent: "buddy" })
    const gate = api.gate()
    await using events = await api.events()
    try {
      await api.promptAsync(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "hold", key: gate.key, text: "Foreground child complete" }) }), { agent: "buddy" })
      await gate.entered
      const child = (await api.children(parent.id))[0]
      if (!child) throw new Error("Missing child before its first answer")
      expect(child.parentID).toBe(parent.id)
      expect(child.metadata).toMatchObject({ buddyTeaching: { roleID: "flashcard-author", ownerSessionID: child.id } })
      gate.release()
      await events.idle(parent.id)
      const changes = events.seen.filter((event) => event.payload.type === "session.updated" || event.payload.type === "message.updated").map(transcript)
      const prepared = changes.findIndex((event) => {
        if (event.type !== "session.updated" || event.properties.info.id !== child.id) return false
        return z.object({ roleID: z.literal("flashcard-author") }).safeParse(event.properties.info.metadata?.buddyTeaching).success
      })
      const firstStep = changes.findIndex((event) => event.type === "message.updated" && event.properties.info.sessionID === child.id && event.properties.info.role === "assistant")
      expect(prepared).toBeGreaterThanOrEqual(0)
      expect(firstStep).toBeGreaterThan(prepared)
      const tools = (await api.messages(parent.id)).flatMap((message) => message.parts).filter((part) => part.type === "tool" && part.subagent)
      expect(tools).toContainEqual(expect.objectContaining({ state: expect.objectContaining({ status: "completed" }), subagent: expect.objectContaining({ childSessionID: child.id, agentID: "flashcard-author", background: false, workerStatus: "completed", result: expect.stringContaining("Foreground child complete") }) }))
    } finally { gate.release() }
  })

  test("a background child finishes independently and the parent receives its result", async () => {
    const parent = await api.create({ agent: "buddy" })
    const gate = api.gate()
    await using events = await api.events()
    try {
      const response = await api.prompt(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "hold", key: gate.key, text: "Background child complete" }), background: true }), { agent: "buddy" })
      expect(response.status).toBe(200)
      await gate.entered
      const child = (await api.children(parent.id))[0]
      if (!child) throw new Error("Missing background child")
      expect((await api.statuses())[child.id]?.type).toBe("busy")
      expect((await api.messages(parent.id)).flatMap((message) => message.parts).find((part) => part.type === "tool" && part.subagent)).toMatchObject({ subagent: { childSessionID: child.id, background: true, workerStatus: "running" } })
      gate.release()
      await events.until((event) => event.payload.type === "message.part.updated" && JSON.stringify(event.payload.properties).includes('"outcome":"completed"'))
      await events.idle(parent.id)
      const history = await api.messages(parent.id)
      expect(history.flatMap((message) => message.parts).filter((part) => part.type === "notice" && part.completion?.childSessionID === child.id)).toMatchObject([{ completion: { childSessionID: child.id, outcome: "completed", result: "Background child complete" } }])
      expect(history.some((message) => message.info.role === "assistant" && message.info.kind !== "synthetic" && messageText(message).includes("Background child complete"))).toBe(true)
    } finally { gate.release() }
  })

  test("stopping a background child returns it to idle and tells the parent it was cancelled", async () => {
    const parent = await api.create({ agent: "buddy" })
    const gate = api.gate()
    await using events = await api.events()
    try {
      expect((await api.prompt(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "hold", key: gate.key, text: "Stopped child" }), background: true }), { agent: "buddy" })).status).toBe(200)
      await gate.entered
      const child = (await api.children(parent.id))[0]
      if (!child) throw new Error("Missing background child")
      expect(await api.json(`/session/${child.id}/abort`, { method: "POST" })).toBe(true)
      await events.until((event) => event.payload.type === "message.part.updated" && JSON.stringify(event.payload.properties).includes('"outcome":"cancelled"'))
      await events.idle(parent.id)
      expect((await api.statuses())[child.id]).toBeUndefined()
      expect((await api.messages(parent.id)).flatMap((message) => message.parts).find((part) => part.type === "notice" && part.completion?.childSessionID === child.id)).toMatchObject({ completion: { childSessionID: child.id, outcome: "cancelled" } })
    } finally { gate.release() }
  })

  test("stopping an idle parent stops its background child without another parent turn", async () => {
    const parent = await api.create({ agent: "buddy" })
    const gate = api.gate()
    await using events = await api.events()
    try {
      expect((await api.prompt(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "hold", key: gate.key, text: "Stopped with parent" }), background: true }), { agent: "buddy" })).status).toBe(200)
      await gate.entered
      const child = (await api.children(parent.id))[0]
      if (!child) throw new Error("Missing background child")
      await events.idle(parent.id)
      const assistantCount = (await api.messages(parent.id)).filter((message) => message.info.role === "assistant" && message.info.kind === undefined).length
      expect(await api.json(`/session/${parent.id}/abort`, { method: "POST" })).toBe(true)
      await events.until((event) => {
        if (event.payload.type !== "message.part.updated") return false
        const update = transcript(event)
        return update.type === "message.part.updated" && update.properties.part.type === "notice" && update.properties.part.sessionID === parent.id && update.properties.part.completion?.childSessionID === child.id && update.properties.part.completion.outcome === "cancelled"
      })
      expect((await api.statuses())[child.id]).toBeUndefined()
      gate.release()
      await events.idle(parent.id)
      expect((await api.messages(parent.id)).filter((message) => message.info.role === "assistant" && message.info.kind === undefined).length).toBe(assistantCount)
    } finally { gate.release() }
  })
})
