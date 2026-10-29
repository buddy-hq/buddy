import { describe, expect, test } from "bun:test"
import z from "zod"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness, scenario } from "../conformance/harness"
import { createConfigConformanceHarness } from "../conformance/harness-config"

describe("session compaction", () => {
  test("waits for a completed summary and retains the requested model for the next prompt", async () => {
    await using harness = await createConfigConformanceHarness()
    const notebook = await harness.notebook("compaction-model", { provider: { scripted: { npm: "@ai-sdk/perplexity", options: { apiKey: "fixture-key" }, models: { chat: {}, compact: {} } } } })
    const session = await notebook.json("/session", z.object({ id: z.string() }), { body: {} })
    const runtime = await getAgentRuntime()
    const options = { directory: notebook.directory }
    expect((await runtime.execution.prompt({ sessionID: session.id, text: "Conversation to summarize" }, options)).ok).toBe(true)
    expect(await runtime.execution.compact({ sessionID: session.id, model: { providerID: "scripted", modelID: "compact" } })).toEqual({ ok: true, value: true })
    const history = await runtime.conversations.history({ directory: notebook.directory, sessionID: session.id })
    expect(history.items.flatMap((message) => message.parts)).toContainEqual(expect.objectContaining({ type: "compaction", status: "completed" }))
    const next = await runtime.execution.prompt({ sessionID: session.id, text: "after-compaction-model-selection" }, options)
    expect(next).toMatchObject({ ok: true, value: { info: { providerID: "scripted", modelID: "compact" } } })
    expect(harness.latestRequest("after-compaction-model-selection").prompt).toContain("Conformance compacted history.")
  })

  test("reports compaction failure instead of only successful admission", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Conversation to summarize" }))).status).toBe(200)
    const result = await (await getAgentRuntime()).execution.compact({ sessionID: session.id })
    expect(result).toMatchObject({ ok: false, error: { kind: "internal" } })
    expect((await api.messages(session.id)).flatMap((message) => message.parts)).toContainEqual(expect.objectContaining({ type: "compaction", status: "failed" }))
  })
})
