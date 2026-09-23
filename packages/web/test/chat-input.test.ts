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

  test("uses Command+Enter on macOS and Control+Enter on Windows", () => {
    const enter = {
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }
    expect(shouldSubmitComposer({ ...enter, metaKey: true }, "mac")).toBe(true)
    expect(shouldSubmitComposer({ ...enter, ctrlKey: true }, "mac")).toBe(false)
    expect(shouldSubmitComposer({ ...enter, ctrlKey: true }, "windows")).toBe(true)
    expect(shouldSubmitComposer({ ...enter, metaKey: true }, "windows")).toBe(false)
    expect(shouldSubmitComposer({ ...enter, metaKey: true, shiftKey: true }, "mac")).toBe(false)
    expect(
      shouldSubmitComposer(
        {
          ...enter,
          metaKey: true,
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          rightCommandPressed: true,
        },
        "mac",
      ),
    ).toBe(true)
    expect(
      shouldSubmitComposer(
        {
          ...enter,
          metaKey: true,
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          rightCommandPressed: true,
          physicalShiftPressed: true,
        },
        "mac",
      ),
    ).toBe(false)
    expect(
      shouldSubmitComposer(
        {
          ...enter,
          metaKey: true,
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          rightCommandPressed: true,
          physicalAltPressed: true,
        },
        "mac",
      ),
    ).toBe(false)
    expect(
      shouldSubmitComposer(
        {
          ...enter,
          metaKey: true,
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
        },
        "mac",
      ),
    ).toBe(false)
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
