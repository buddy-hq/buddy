import { describe, expect, test } from "bun:test"
import type { InAppBrowserMouseNavigation } from "@buddy/browser-contract"
import { installInAppBrowserMouseNavigation } from "../src/main/in-app-browser-mouse-navigation"

describe("in-app Browser mouse navigation", () => {
  test("routes main-frame messages through the guest navigation history", () => {
    const mainFrame = {}
    let listener:
      | ((
          event: { readonly senderFrame: object | null },
          payload: InAppBrowserMouseNavigation | null | undefined,
        ) => void)
      | undefined
    const calls: string[] = []
    // SAFETY: The adapter uses only the three structural members supplied by this focused test.
    const guest = {
      mainFrame,
      ipc: {
        on: (
          _channel: string,
          next: (
            event: { readonly senderFrame: object | null },
            payload: InAppBrowserMouseNavigation | null | undefined,
          ) => void,
        ) => {
          listener = next
        },
        removeListener: () => undefined,
      },
      navigationHistory: {
        canGoBack: () => true,
        canGoForward: () => false,
        goBack: () => calls.push("back"),
        goForward: () => calls.push("forward"),
      },
    }

    installInAppBrowserMouseNavigation(guest)
    const event = { senderFrame: mainFrame }
    listener?.(event, { direction: "back" })
    listener?.(event, { direction: "forward" })
    listener?.(event, undefined)
    listener?.({ senderFrame: {} }, { direction: "back" })

    expect(calls).toEqual(["back", "back"])
  })
})
