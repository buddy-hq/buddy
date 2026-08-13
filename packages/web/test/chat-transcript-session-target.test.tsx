import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import {
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"

const DIRECTORY = "/repo/bench-session-target"
const ROOT_SESSION_ID = "root-session"
const CHILD_SESSION_ID = "child-session"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe("ChatTranscript session target", () => {
  let container: HTMLDivElement
  let root: Root
  let transcriptViewport: ChatTranscriptTestViewport
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    useChatStore.setState({ directories: {} })
    transcriptViewport.cleanup()
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders an explicit subagent session without changing the active root chat", async () => {
    const rootMessage = createMessageWithParts(
      createUserMessageInfo({ id: "root-message", sessionID: ROOT_SESSION_ID }),
      [
        {
          id: "root-part",
          sessionID: ROOT_SESSION_ID,
          messageID: "root-message",
          type: "text",
          text: "Root chat content",
        },
      ],
    )
    const childMessage = createMessageWithParts(
      createUserMessageInfo({ id: "child-message", sessionID: CHILD_SESSION_ID }),
      [
        {
          id: "child-part",
          sessionID: CHILD_SESSION_ID,
          messageID: "child-message",
          type: "text",
          text: "Subagent Bench content",
        },
      ],
    )

    await act(async () => {
      seedDirectoryChatState(DIRECTORY, {
        sessionID: ROOT_SESSION_ID,
        messagesBySessionID: {
          [ROOT_SESSION_ID]: [rootMessage],
          [CHILD_SESSION_ID]: [childMessage],
        },
      })
      root.render(
        <ChatTranscript
          directory={DIRECTORY}
          sessionID={CHILD_SESSION_ID}
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBe(ROOT_SESSION_ID)
    expect(container.textContent).toContain("Subagent Bench content")
    expect(container.textContent).not.toContain("Root chat content")
  })
})
