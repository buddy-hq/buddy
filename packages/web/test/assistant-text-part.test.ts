import { describe, expect, test } from "bun:test"
import { stripLeadingRenderMermaidMarkdown } from "../src/components/chat/parts/assistant-part/text-part"

describe("assistant text part", () => {
  test("strips a leading Mermaid block that matches the original tool input source", () => {
    const text = '```mermaid\ngitgraph\ncommit id: "1"\n```\n\nExplanation'

    expect(
      stripLeadingRenderMermaidMarkdown(text, [
        'gitGraph\ncommit id: "1"',
        'gitgraph\ncommit id: "1"',
      ]),
    ).toBe("Explanation")
  })

  test("keeps leading Mermaid blocks that do not match tool or artifact sources", () => {
    const text = "```mermaid\ngraph TD\nA-->C\n```\n\nExplanation"

    expect(stripLeadingRenderMermaidMarkdown(text, ["graph TD\nA-->B"])).toBe(text)
  })
})
