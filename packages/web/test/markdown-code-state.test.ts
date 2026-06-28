import { describe, expect, test } from "bun:test"
import { shouldResetCodeTokens } from "../src/components/markdown/markdown-code-state"

const previous = {
  language: "ts",
  generation: 1,
  stableCount: 3,
  unstable: [],
  raw: "```ts\nconst x = 1\n```",
}

describe("markdown code state", () => {
  test("resets a non-prefix replacement with the same generation and token count", () => {
    expect(
      shouldResetCodeTokens(previous, {
        language: "ts",
        generation: 1,
        stableCount: 3,
        raw: "```ts\nlet y = 2\n```",
      }),
    ).toBe(true)
  })

  test("retains an append-only streaming update", () => {
    expect(
      shouldResetCodeTokens(previous, {
        language: "ts",
        generation: 1,
        stableCount: 4,
        raw: `${previous.raw}\nmore`,
      }),
    ).toBe(false)
  })
})
