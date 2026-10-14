import { describe, expect, test } from "bun:test"
import { TOOL_PROMPTS } from "../src/components/debug/tool-designs"
import {
  formatToolSignature,
  type ToolSignatureLine,
} from "../src/components/debug/tool-designs/signature"

function renderLines(lines: readonly ToolSignatureLine[]) {
  return lines
    .map((line) => {
      if (line.kind === "gap") return ""
      const text =
        line.kind === "note" ? `// ${line.text}` : line.tokens.map((part) => part.text).join("")
      return `${"  ".repeat(line.depth)}${text}`
    })
    .join("\n")
}

describe("formatToolSignature", () => {
  test("shows names, allowed values, optional fields, limits, and descriptions", () => {
    const parameters = JSON.stringify({
      type: "object",
      properties: {
        action: { description: "What to do.", type: "string", enum: ["show", "close"] },
        items: {
          description: "What to show.",
          minItems: 1,
          maxItems: 12,
          type: "array",
          items: {
            type: "object",
            properties: { path: { description: "A local file.", type: "string", minLength: 1 } },
            required: ["path"],
          },
        },
      },
      required: ["action"],
      additionalProperties: false,
    })

    expect(renderLines(formatToolSignature("present", parameters))).toBe(
      [
        "present({",
        "  // What to do.",
        '  action: "show" | "close",',
        "",
        "  // What to show.",
        "  // 1–12 items.",
        "  items?: Array<{",
        "    // A local file.",
        "    path: string,",
        "  }>,",
        "})",
      ].join("\n"),
    )
  })

  test("keeps a description's own formatting in one note", () => {
    const description = "Where it appears:\n- inline: in the conversation.\n- bench: beside the chat."
    const parameters = JSON.stringify({
      type: "object",
      properties: { where: { description, type: "string", enum: ["inline", "bench"] } },
    })

    const notes = formatToolSignature("present", parameters).flatMap((line) =>
      line.kind === "note" ? [line.text] : [],
    )
    expect(notes).toEqual([description])
  })

  test("colours each part of a field by its role", () => {
    const parameters = JSON.stringify({
      type: "object",
      properties: { where: { type: "string", enum: ["inline", "bench"] } },
    })

    const field = formatToolSignature("present", parameters).find(
      (line) => line.kind === "code" && line.depth === 1,
    )
    const tokens = field?.kind === "code" ? field.tokens : []
    expect(tokens.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "field", text: "where" },
      { role: "optional", text: "?" },
      { role: "punctuation", text: ": " },
      { role: "literal", text: '"inline"' },
      { role: "punctuation", text: " | " },
      { role: "literal", text: '"bench"' },
      { role: "punctuation", text: "," },
    ])
  })

  test("formats every registered tool without unknown types", () => {
    for (const entry of TOOL_PROMPTS) {
      const types = formatToolSignature(entry.tool.name, entry.tool.parameters).flatMap((line) =>
        line.kind === "code" ? line.tokens.filter((part) => part.role === "type") : [],
      )
      expect(types.map((part) => part.text)).not.toContain("unknown")
    }
  })
})
