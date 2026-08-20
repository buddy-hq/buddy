import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatSettings } from "../src/state/chat-settings"
import { useChatStore } from "../src/state/chat-store"
import { BUSY_SESSION_STATUS } from "../src/state/session-status"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for transcript content")
    await flushEffects()
  }
}

describe("chat transcript expansion cache", () => {
  let container: HTMLDivElement
  let root: Root
  let transcriptViewport: ChatTranscriptTestViewport
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    transcriptViewport = createChatTranscriptTestViewport()

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
    resetTranscriptRepositoryForTests()
    useChatSettings.setState({ showReasoningSummaries: true })
    useChatStore.setState({ directories: {} })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    useChatStore.setState({ directories: {} })
    resetTranscriptRepositoryForTests()
    transcriptViewport.cleanup()
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("restores expanded hidden steps after a brief transcript unmount", async () => {
    const directory = "/repo-expansion-cache"
    seedDirectoryChatState(directory, {
      sessionID: "ses_expansion_cache",
      isBusy: true,
      sessionStatusByID: {
        ses_expansion_cache: BUSY_SESSION_STATUS,
      },
      messages: [
        createMessageWithParts(
          createUserMessageInfo({
            id: "msg_a_expansion_user",
            sessionID: "ses_expansion_cache",
          }),
          [
            {
              id: "prt_expansion_user",
              sessionID: "ses_expansion_cache",
              messageID: "msg_a_expansion_user",
              type: "text",
              text: "Explain the plan",
            },
          ],
        ),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "msg_b_expansion_assistant",
            sessionID: "ses_expansion_cache",
            parentID: "msg_a_expansion_user",
          }),
          [
            {
              id: "prt_expansion_reasoning",
              sessionID: "ses_expansion_cache",
              messageID: "msg_b_expansion_assistant",
              type: "reasoning",
              text: "# Planning\n\nChecking the route.",
              time: { start: 1 },
            },
          ],
        ),
      ],
    })

    await act(async () => {
      root.render(
        <ChatTranscript directory={directory} scrollViewportRef={transcriptViewport.ref} />,
      )
      await flushEffects()
    })

    const planningButton = container.querySelector<HTMLButtonElement>("[data-activity-row] > button")
    expect(planningButton).not.toBeNull()

    await act(async () => {
      planningButton?.click()
      await flushEffects()
    })
    await waitFor(() => container.querySelector("[data-activity-entry]") !== null)

    const planningDetailsButton = container.querySelector<HTMLButtonElement>(
      "[data-activity-entry] > button",
    )
    expect(planningDetailsButton).not.toBeNull()

    await act(async () => {
      planningDetailsButton?.click()
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes("Checking the route.") === true)
    expect(container.textContent).toContain("Checking the route.")

    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    root = createRoot(container)

    await act(async () => {
      root.render(
        <ChatTranscript directory={directory} scrollViewportRef={transcriptViewport.ref} />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Checking the route.")
  })
})
