import { describe, expect, test } from "bun:test"
import { readCapturedSessionSystemPrompt } from "../../src/runtime/system-prompt-capture"
import { createRuntimeGuaranteesHarness, messageText, scenario } from "./harness"

type Harness = Awaited<ReturnType<typeof createRuntimeGuaranteesHarness>>

function expectChatRules(api: Harness, marker: string) {
  const requests = api.requests.filter((request) => request.text.includes(marker))
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    expect(request.system).toContain("conformance-kept-instruction")
    expect(request.system).not.toContain("conformance-excluded-instruction")
  }
}

describe("Runtime guarantees", () => {
  test("block on failure: refuse a chat without a reply, then retry chat-rules setup", async () => {
    let attempts = 0
    await using api = await createRuntimeGuaranteesHarness({ extension: (buddy) => ({
      ...buddy,
      hooks(location, sessions) {
        attempts += 1
        if (attempts === 1) throw new Error("Conformance chat-rules setup failed")
        return buddy.hooks(location, sessions)
      },
    }) })
    const session = await api.create()
    const refused = await api.prompt(session.id, scenario({ kind: "reply", text: "Refused answer" }))
    expect(refused).toMatchObject({ ok: false, error: { kind: "internal", message: "UnexpectedStatus: 500" } })
    expect((await api.messages(session.id)).filter((message) => message.info.role === "assistant")).toEqual([])
    expect(api.requests.filter((request) => request.text.includes("Refused answer"))).toEqual([])
    expect(attempts).toBe(1)

    const retried = await api.prompt(session.id, scenario({ kind: "reply", text: "Answer with chat rules" }))
    expect(retried.ok).toBe(true)
    if (!retried.ok) throw retried.error
    expect(messageText(retried.value)).toBe("Answer with chat rules")
    expect(attempts).toBe(2)
    expectChatRules(api, "Answer with chat rules")
  })

  test("rules first on resume: startup recovery runs with chat rules or fails", async () => {
    const recovering = Promise.withResolvers<void>()
    const releaseRecovery = Promise.withResolvers<void>()
    let restarting = false
    await using api = await createRuntimeGuaranteesHarness({ extension: (buddy) => ({
      ...buddy,
      async tools(location) {
        if (restarting) {
          recovering.resolve()
          await releaseRecovery.promise
        }
        return buddy.tools(location)
      },
    }) })
    const session = await api.create()
    const gate = api.gate()
    const marker = "Reply interrupted before restart"
    await using originalEvents = await api.events()
    const pending = api.prompt(session.id, scenario({ kind: "stream", key: gate.key, text: marker }))
    try {
      await gate.entered
      await originalEvents.until((event) => event.type === "session.text.delta" && event.data.sessionID === session.id && event.data.delta === marker)
      const interrupted = await api.messages(session.id)
      expect(interrupted.some((message) => message.info.role === "assistant" && message.info.time.completed === undefined)).toBe(true)
      await api.close()
      await pending
      const before = api.requests.length
      restarting = true
      await api.restart()
      expect((await api.messages(session.id)).some((message) => message.info.role === "assistant" && messageText(message) === marker)).toBe(true)
      await recovering.promise
      await using events = await api.events()
      releaseRecovery.resolve()
      gate.release()
      const outcome = await events.finished(session.id)
      expect(["session.execution.succeeded", "session.execution.failed"]).toContain(outcome.type)
      const resumed = api.requests.slice(before)
      for (const request of resumed) {
        expect(request.system).toContain("conformance-kept-instruction")
        expect(request.system).not.toContain("conformance-excluded-instruction")
      }
      if (outcome.type === "session.execution.succeeded") {
        expect(resumed.length).toBeGreaterThan(0)
        expect((await api.messages(session.id)).some((message) => message.info.role === "assistant" && message.info.finish === "stop")).toBe(true)
      } else {
        expect(outcome.data.error).toMatchObject({ type: expect.any(String) })
      }
    } finally {
      releaseRecovery.resolve()
      gate.release()
      await pending
    }
  })

  test("rules first, normal start: the first turn in a fresh notebook runs with chat rules", async () => {
    await using api = await createRuntimeGuaranteesHarness()
    const session = await api.create()
    expect(await api.messages(session.id)).toEqual([])
    const reply = await api.prompt(session.id, scenario({ kind: "reply", text: "First notebook answer" }))
    expect(reply.ok).toBe(true)
    if (!reply.ok) throw reply.error
    expect(messageText(reply.value)).toBe("First notebook answer")
    expectChatRules(api, "First notebook answer")
    const captured = await readCapturedSessionSystemPrompt({ directory: api.directory, sessionID: session.id })
    expect(captured).toContain("conformance-kept-instruction")
    expect(captured).not.toContain("conformance-excluded-instruction")
  })
})
