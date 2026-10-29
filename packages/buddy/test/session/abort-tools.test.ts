import { describe, expect, test } from "bun:test"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness, scenario } from "../conformance/harness"

describe("tool cancellation", () => {
  test("interrupts a real tool turn and discards its late result", async () => {
    await using api = await createRuntimeHarness()
    const runtime = await getAgentRuntime()
    const session = await api.create()
    const gate = api.gate()
    const turn = runtime.execution.prompt({ sessionID: session.id, text: scenario({ kind: "pause", key: gate.key, text: "Cancelled answer" }) }, { directory: api.directory, signal: AbortSignal.timeout(10_000) })
    try {
      await gate.entered
      expect(await runtime.execution.interrupt(session.id)).toBe(true)
      gate.release()
      await turn
      const history = await api.messages(session.id)
      const tools = history.flatMap((message) => message.parts).filter((part) => part.type === "tool")
      expect(tools).toContainEqual(expect.objectContaining({ state: expect.objectContaining({ status: "error", errorType: "aborted" }) }))
      expect(JSON.stringify(history)).not.toContain("Pause released.")
      expect(await runtime.execution.interrupt(session.id)).toBe(false)
    } finally { gate.release(); await turn }
  })
})
