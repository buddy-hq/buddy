import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import type { ChatTranscriptProps } from "../src/components/chat/types"
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

const directory = "/repo-forking"
const sessionID = "ses_forking"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function userMessage(id: string, text: string) {
  return createMessageWithParts(createUserMessageInfo({ id, sessionID }), [
    {
      id: `prt_${id}`,
      sessionID,
      messageID: id,
      type: "text",
      text,
    },
  ])
}

function assistantMessage(id: string, parentID: string, text: string) {
  return createMessageWithParts(
    createAssistantMessageInfo({
      id,
      parentID,
      sessionID,
      time: { created: 1, completed: 2 },
    }),
    [
      {
        id: `prt_${id}`,
        sessionID,
        messageID: id,
        type: "text",
        text,
      },
    ],
  )
}

function branchButtons(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-label="Branch from here"]'),
  )
}

describe("chat forking", () => {
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

  test("branches after the selected assistant response", async () => {
    const requests: Parameters<NonNullable<ChatTranscriptProps["onForkMessage"]>>[0][] = []
    seedDirectoryChatState(directory, {
      sessionID,
      isReady: true,
      messages: [
        userMessage("msg_001_user", "First prompt"),
        assistantMessage("msg_002_assistant", "msg_001_user", "First response"),
        userMessage("msg_003_user", "Second prompt"),
        assistantMessage("msg_004_assistant", "msg_003_user", "Second response"),
      ],
    })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          onForkMessage={(request) => {
            requests.push(request)
          }}
        />,
      )
      await flushEffects()
    })

    const buttons = branchButtons(container)
    expect(buttons).toHaveLength(2)

    await act(async () => {
      buttons[0]?.click()
      buttons[1]?.click()
      await flushEffects()
    })

    expect(requests).toEqual([{ sessionID, messageID: "msg_003_user" }, { sessionID }])
  })

  test("does not restore hidden reverted messages when branching from the last visible response", async () => {
    const requests: Parameters<NonNullable<ChatTranscriptProps["onForkMessage"]>>[0][] = []
    seedDirectoryChatState(directory, {
      sessionID,
      isReady: true,
      sessions: [
        {
          id: sessionID,
          title: "Forking test",
          time: { created: 1, updated: 1 },
          revert: { messageID: "msg_003_user" },
        },
      ],
      messages: [
        userMessage("msg_001_user", "Visible prompt"),
        assistantMessage("msg_002_assistant", "msg_001_user", "Visible response"),
        userMessage("msg_003_user", "Reverted prompt"),
      ],
    })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          onForkMessage={(request) => {
            requests.push(request)
          }}
        />,
      )
      await flushEffects()
    })

    const buttons = branchButtons(container)
    expect(buttons).toHaveLength(1)

    await act(async () => {
      buttons[0]?.click()
      await flushEffects()
    })

    expect(requests).toEqual([{ sessionID, messageID: "msg_003_user" }])
  })
})
