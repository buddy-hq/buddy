import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { HiddenSteps } from "../src/components/chat/tools/hidden-steps"
import type { MessagePart } from "../src/state/chat-types"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function runningToolWithoutSummary(): MessagePart {
  return {
    id: "prt_tool_without_summary",
    sessionID: "ses_hidden_steps_layout",
    messageID: "msg_hidden_steps_layout",
    type: "tool",
    tool: "summaryless_tool",
    callID: "call_summaryless_tool",
    state: {
      status: "running",
      input: {},
      time: {
        start: 2,
      },
    },
  }
}

describe("hidden steps layout", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("reserves live preview space when a running hidden tool has no summary", async () => {
    await act(async () => {
      root.render(<HiddenSteps parts={[runningToolWithoutSummary()]} isBusy />)
      await flushEffects()
    })

    const previewViewport = container.querySelector("[data-preview-viewport]")
    expect(previewViewport).not.toBeNull()
    expect((previewViewport as HTMLDivElement).style.height).toBe("80px")
    expect(previewViewport?.textContent).toBe("")
  })
})
