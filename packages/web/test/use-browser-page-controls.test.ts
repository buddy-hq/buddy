import { describe, expect, spyOn, test } from "bun:test"
import type { InAppBrowserCommandResult } from "@buddy/browser-contract"
import { applyInAppBrowserAppearance } from "../src/components/bench/surfaces/browser/use-browser-page-controls"

const REQUEST = { webContentsID: 42, appearance: "dark" as const }

function delay(result: InAppBrowserCommandResult): Promise<InAppBrowserCommandResult> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(result))
  })
}

describe("in-app Browser appearance apply", () => {
  test("logs a structured failure once for a rejected command and a failed result", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)
    const cause = new Error("debugger attach failed")

    try {
      await applyInAppBrowserAppearance(
        async () => {
          throw cause
        },
        { ...REQUEST, webContentsID: 7 },
      )
      await applyInAppBrowserAppearance(
        async () => ({ _tag: "failed", reason: "tab-unavailable" }),
        {
          ...REQUEST,
          webContentsID: 8,
        },
      )

      expect(consoleError.mock.calls).toEqual([
        ["[in-app-browser] appearance.failed", { webContentsID: 7, appearance: "dark", cause }],
        [
          "[in-app-browser] appearance.failed",
          { webContentsID: 8, appearance: "dark", reason: "tab-unavailable" },
        ],
      ])
    } finally {
      consoleError.mockRestore()
    }
  })

  test("does not log a successful apply", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)

    try {
      await applyInAppBrowserAppearance(async () => ({ _tag: "done" }), REQUEST)
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  test("shares one in-flight request so attach and later apply do not double-log", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)
    let calls = 0
    const setAppearance = () => {
      calls += 1
      return delay({ _tag: "failed", reason: "operation-failed" })
    }

    try {
      const first = applyInAppBrowserAppearance(setAppearance, REQUEST)
      const second = applyInAppBrowserAppearance(setAppearance, REQUEST)
      await Promise.all([first, second])

      expect(calls).toBe(1)
      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith("[in-app-browser] appearance.failed", {
        webContentsID: 42,
        appearance: "dark",
        reason: "operation-failed",
      })
    } finally {
      consoleError.mockRestore()
    }
  })
})
