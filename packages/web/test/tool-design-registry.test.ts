import { describe, expect, test } from "bun:test"
import { TOOL_DESIGNS, TOOL_PROMPTS } from "../src/components/debug/tool-designs"

describe("tool design registry", () => {
  test("registers distinct, complete tool prompts", () => {
    const designIDs = TOOL_DESIGNS.map((design) => design.id)
    const toolPromptIDs = TOOL_PROMPTS.map((entry) => entry.id)

    expect(TOOL_DESIGNS.length).toBeGreaterThan(0)
    expect(new Set(designIDs).size).toBe(designIDs.length)
    expect(new Set(toolPromptIDs).size).toBe(toolPromptIDs.length)

    for (const entry of TOOL_PROMPTS) {
      expect(entry.id).toBe(`${entry.design.id}/${entry.tool.id}`)
      expect(entry.tool.description.trim().length).toBeGreaterThan(0)
      expect(JSON.parse(entry.tool.parameters)).toMatchObject({ type: "object" })
      expect(entry.tool.returns.length).toBeGreaterThan(0)
    }
  })
})
