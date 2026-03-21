import { describe, expect, test } from "bun:test"
import { shouldSubmitComposer } from "../src/lib/chat-input"

describe("chat composer keyboard behavior", () => {
  test("submits on Enter", () => {
    expect(
      shouldSubmitComposer({
        key: "Enter",
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)
  })

  test("does not submit on Shift+Enter", () => {
    expect(
      shouldSubmitComposer({
        key: "Enter",
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)
  })

  test("does not submit while composing IME input", () => {
    expect(
      shouldSubmitComposer({
        key: "Enter",
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: true,
      }),
    ).toBe(false)
  })
})
