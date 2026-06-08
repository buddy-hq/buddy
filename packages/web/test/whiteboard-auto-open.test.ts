import { describe, expect, test } from "bun:test"
import { shouldAutoOpenWhiteboard } from "../src/components/whiteboard/whiteboard-auto-open"

describe("whiteboard auto-open", () => {
  test("does not recapture chat after the user explicitly left the active whiteboard tool", () => {
    expect(
      shouldAutoOpenWhiteboard({
        activeToolKey: "message-1:part-1",
        pathname: "/notebook/chat",
        suppressedToolKey: "message-1:part-1",
      }),
    ).toBe(false)
  })

  test("opens the whiteboard for a new active tool after the previous one was dismissed", () => {
    expect(
      shouldAutoOpenWhiteboard({
        activeToolKey: "message-2:part-1",
        pathname: "/notebook/chat",
        suppressedToolKey: "message-1:part-1",
      }),
    ).toBe(true)
  })

  test("never auto-opens while the user is already on the whiteboard route", () => {
    expect(
      shouldAutoOpenWhiteboard({
        activeToolKey: "message-1:part-1",
        pathname: "/notebook/whiteboard",
        suppressedToolKey: undefined,
      }),
    ).toBe(false)
  })
})
