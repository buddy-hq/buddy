import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SessionRetryNotice, retryCopyKey } from "../src/components/chat/session-retry-notice"
import { readNetworkStatus, useNetworkStatus } from "../src/lib/network-status"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

let online = true

function goOffline() {
  online = false
  window.dispatchEvent(new Event("offline"))
}

function goOnline() {
  online = true
  window.dispatchEvent(new Event("online"))
}

function NetworkStatusProbe() {
  return <span>{useNetworkStatus()}</span>
}

describe("network status", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    online = true
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    Reflect.deleteProperty(navigator, "onLine")
  })

  test("reads navigator.onLine", () => {
    expect(readNetworkStatus()).toBe("online")
    online = false
    expect(readNetworkStatus()).toBe("offline")
  })

  test("follows the window's offline and online events", async () => {
    await act(async () => {
      root.render(<NetworkStatusProbe />)
      await flushEffects()
    })
    expect(container.textContent).toBe("online")

    await act(async () => goOffline())
    expect(container.textContent).toBe("offline")

    await act(async () => goOnline())
    expect(container.textContent).toBe("online")
  })

  test("offline explains network and unclassified retries, not provider responses", () => {
    expect(retryCopyKey("network", "offline")).toBe("offline")
    expect(retryCopyKey("unknown", "offline")).toBe("offline")
    expect(retryCopyKey("rate-limit", "offline")).toBe("rate-limit")
    expect(retryCopyKey("overloaded", "offline")).toBe("overloaded")
    expect(retryCopyKey("network", "online")).toBe("network")
  })

  test("the retry notice switches to offline copy while disconnected", async () => {
    await act(async () => {
      root.render(
        <SessionRetryNotice
          model={{
            stage: "notice",
            category: "network",
            attempt: 3,
            next: Date.now() + 5_000,
            rawMessage: "fetch failed",
            action: undefined,
          }}
          onAction={() => {}}
        />,
      )
      await flushEffects()
    })
    expect(container.textContent).toContain("Reconnecting to the model")

    await act(async () => goOffline())
    expect(container.textContent).toContain("You’re offline")
    expect(container.textContent).not.toContain("Reconnecting to the model")

    await act(async () => goOnline())
    expect(container.textContent).toContain("Reconnecting to the model")
  })
})
