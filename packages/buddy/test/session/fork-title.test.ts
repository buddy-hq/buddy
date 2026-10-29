import { describe, expect, test } from "bun:test"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness, scenario } from "../conformance/harness"

describe("fork title lineage", () => {
  test("increments fork titles, resets numbering on rename and returns independent metadata", async () => {
    await using api = await createRuntimeHarness()
    const { conversations } = await getAgentRuntime()
    const original = await api.create({ title: "Original", metadata: { retained: { value: 1 } } })
    expect((await api.prompt(original.id, scenario({ kind: "reply", text: "Seed history" }))).status).toBe(200)
    const first = await conversations.fork(original.id)
    expect(first.title).toBe("Original (2)")
    expect((await conversations.fork(first.id)).title).toBe("Original (3)")
    if (!first.metadata) throw new Error("Expected retained fork metadata")
    Object.assign(first.metadata, { retained: { value: 999 } })
    expect((await conversations.get(first.id)).metadata?.retained).toEqual({ value: 1 })
    await conversations.update(first.id, { title: "Renamed" })
    expect((await conversations.fork(first.id)).title).toBe("Renamed (2)")
  })
})
