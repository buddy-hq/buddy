import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import { createMessageWithParts, createUserMessageInfo, seedDirectoryChatState } from "./test-utils"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("chat transcript busy placeholder", () => {
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
    useChatStore.setState({ directories: {} })
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("shows inline thinking when an active session has no visible assistant events yet", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_busy",
        isBusy: true,
        sessionStatusByID: {
          ses_busy: { type: "busy" },
        },
        messages: [],
      })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelector("[data-abstracted-thinking-placeholder]")).not.toBeNull()
  })

  test("keeps immediate thinking on a normal optimistic send", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_busy",
        isBusy: true,
        sessionStatusByID: {
          ses_busy: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_user_optimistic",
              sessionID: "ses_busy",
            }),
            [
              {
                id: "prt_user_optimistic",
                sessionID: "ses_busy",
                messageID: "msg_user_optimistic",
                type: "text",
                text: "Normal prompt",
                optimistic: true,
              },
            ],
          ),
        ],
      })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    const placeholders = container.querySelectorAll("[data-abstracted-thinking-placeholder]")
    const articles = Array.from(container.querySelectorAll("article"))

    expect(placeholders).toHaveLength(1)
    expect(articles).toHaveLength(1)
    expect(articles[0]?.textContent).toContain("Normal prompt")
    expect(articles[0]?.textContent).toContain("Thinking")
  })
})
