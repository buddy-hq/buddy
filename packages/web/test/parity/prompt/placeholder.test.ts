import { describe, expect, test } from "bun:test"
import { promptPlaceholder } from "../../../src/components/prompt/placeholder"

const t = (key: string, params?: Record<string, string>) =>
  `${key}${params?.example ? `:${params.example}` : ""}`

describe("promptPlaceholder", () => {
  test("returns shell placeholder in shell mode", () => {
    const value = promptPlaceholder({
      mode: "shell",
      commentCount: 0,
      example: "example",
      suggest: true,
      intent: "auto",
      t,
    })
    expect(value).toBe("prompt.placeholder.shell")
  })

  test("returns summarize placeholders for comment context", () => {
    expect(
      promptPlaceholder({
        mode: "normal",
        commentCount: 1,
        example: "example",
        suggest: true,
        intent: "auto",
        t,
      }),
    ).toBe("prompt.placeholder.summarizeComment")
    expect(
      promptPlaceholder({
        mode: "normal",
        commentCount: 2,
        example: "example",
        suggest: true,
        intent: "auto",
        t,
      }),
    ).toBe("prompt.placeholder.summarizeComments")
  })

  test("returns default placeholder with example when suggestions enabled", () => {
    const value = promptPlaceholder({
      mode: "normal",
      commentCount: 0,
      example: "translated-example",
      suggest: true,
      intent: "auto",
      t,
    })
    expect(value).toBe("prompt.placeholder.normal:translated-example")
  })

  test("returns simple placeholder when suggestions disabled", () => {
    const value = promptPlaceholder({
      mode: "normal",
      commentCount: 0,
      example: "translated-example",
      suggest: false,
      intent: "auto",
      t,
    })
    expect(value).toBe("Ask Buddy...")
  })
})
