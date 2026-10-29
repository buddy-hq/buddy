import { describe, expect, test } from "bun:test"
import { readCommandDisplay, readPromptPresentation } from "../src/prompt"

describe("prompt presentation metadata", () => {
  test("reads persisted segment flags and chip metadata alongside command display", () => {
    const prompt = { system: "Compiled context", segments: [{ start: 0, end: 5, synthetic: true }, { start: 5, end: 12, ignored: true, metadata: { buddyPromptPart: { type: "notebook-reference" } } }] }
    const metadata = { buddy: { prompt, command: { display: "/explain @note.md" } } }
    expect(readPromptPresentation(metadata, "contextchips")).toEqual(prompt)
    expect(readCommandDisplay(metadata)).toBe("/explain @note.md")
  })

  test.each([
    { segments: [{ start: 0, end: 6 }] }, { segments: [{ start: 0.5, end: 2 }] },
    { segments: [{ start: 0, end: 4 }, { start: 3, end: 5 }] }, { segments: [{ start: 3, end: 2 }] },
  ])("rejects invalid persisted segment offsets %j", ({ segments }) => {
    expect(readPromptPresentation({ buddy: { prompt: { segments } } }, "hello")).toBeUndefined()
  })
})
