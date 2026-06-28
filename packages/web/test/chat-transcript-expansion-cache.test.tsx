import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ChatTranscript } from "../src/components/chat/chat-transcript"
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

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text) ?? false,
  )
}

describe("chat transcript expansion cache", () => {
  let container: HTMLDivElement
  let root: Root
  let transcriptViewport: ChatTranscriptTestViewport
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
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

    const planningButton = findButtonByText(container, "Planning")
    expect(planningButton).toBeDefined()

    await act(async () => {
      planningButton?.click()
      await flushEffects()
    })
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

  test("restores expanded tool rows after a brief transcript unmount", async () => {
    const directory = "/repo-tool-expansion-cache"
    seedDirectoryChatState(directory, {
      sessionID: "ses_tool_expansion_cache",
      messages: [
        createMessageWithParts(
          createUserMessageInfo({
            id: "msg_a_tool_user",
            sessionID: "ses_tool_expansion_cache",
          }),
          [
            {
              id: "prt_tool_user",
              sessionID: "ses_tool_expansion_cache",
              messageID: "msg_a_tool_user",
              type: "text",
              text: "Run the command",
            },
          ],
        ),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "msg_b_tool_assistant",
            sessionID: "ses_tool_expansion_cache",
            time: { created: 1, completed: 2 },
          }),
          [
            {
              id: "prt_tool_todo",
              sessionID: "ses_tool_expansion_cache",
              messageID: "msg_b_tool_assistant",
              type: "tool",
              tool: "todowrite",
              callID: "call_tool_todo",
              state: {
                status: "completed",
                input: {
                  todos: [{ content: "Persist this expanded state", status: "pending" }],
                },
                metadata: {},
                attachments: [],
                output: "",
                title: "Update todos",
                time: { start: 1, end: 2 },
              },
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

    expect(container.textContent).toContain("Persist this expanded state")
    const toolButton = container.querySelector<HTMLButtonElement>('button[data-state="open"]')
    expect(toolButton).not.toBeNull()

    await act(async () => {
      toolButton?.click()
      await flushEffects()
    })
    expect(container.textContent).not.toContain("Persist this expanded state")

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

    expect(container.textContent).not.toContain("Persist this expanded state")
    expect(container.querySelector('button[data-state="closed"]')).not.toBeNull()
  })
})
