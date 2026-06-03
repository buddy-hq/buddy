import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import type { MessageWithParts } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function buildTurns(turnCount: number) {
  const messages: MessageWithParts[] = []
  for (let index = 0; index < turnCount; index += 1) {
    const turnID = `${index + 1}`
    const userMessageID = `msg_user_${turnID}`
    const assistantMessageID = `msg_assistant_${turnID}`
    messages.push(
      createMessageWithParts(createUserMessageInfo({ id: userMessageID, sessionID: "ses_stage" }), [
        {
          id: `prt_user_${turnID}`,
          sessionID: "ses_stage",
          messageID: userMessageID,
          type: "text",
          text: `User prompt ${turnID}`,
        },
      ]),
    )
    messages.push(
      createMessageWithParts(
        createAssistantMessageInfo({
          id: assistantMessageID,
          sessionID: "ses_stage",
          parentID: userMessageID,
          time: {
            created: index * 2 + 2,
            completed: index * 2 + 3,
          },
        }),
        [
          {
            id: `prt_assistant_${turnID}`,
            sessionID: "ses_stage",
            messageID: assistantMessageID,
            type: "text",
            text: `Assistant response ${turnID}`,
          },
        ],
      ),
    )
  }
  return messages
}

describe("chat transcript staging", () => {
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

  test("keeps staged tail bottom-packed for idle transcript restores", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_stage",
        isReady: true,
        isBusy: false,
        sessionStatusByID: {
          ses_stage: { type: "idle" },
        },
        messages: buildTurns(7),
      })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelector('[data-chat-transcript-tail-pack="bottom"]')).not.toBeNull()
  })

  test("does not bottom-pack the staged tail while the last turn is streaming", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_stage",
        isReady: true,
        isBusy: true,
        sessionStatusByID: {
          ses_stage: { type: "busy" },
        },
        messages: buildTurns(7),
      })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelector('[data-chat-transcript-tail-pack="natural"]')).not.toBeNull()
  })
})
