import { describe, expect, test } from "bun:test"
import {
  parseClozeText,
  renderClozeText,
} from "../src/components/flashcard/flashcard-card-content"

describe("flashcard cloze content", () => {
  test("parses and hides a deletion whose answer spans lines", () => {
    const text = "Before {{c1::first\nsecond}} after"

    expect(parseClozeText(text)).toEqual([
      { kind: "text", text: "Before " },
      { kind: "deletion", ordinal: 1, answer: "first\nsecond" },
      { kind: "text", text: " after" },
    ])
    expect(renderClozeText(text, 1, false)).toBe("Before [...] after")
    expect(renderClozeText(text, 1, true)).toBe("Before first\nsecond after")
  })
})
