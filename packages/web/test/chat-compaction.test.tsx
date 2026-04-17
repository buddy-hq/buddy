import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import {
  createAssistantMessageInfo,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("ChatTranscript compaction", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useChatStore.getState().resetRuntimeState()
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
    useChatStore.getState().resetRuntimeState()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("renders the vendor-style session compacted divider for compaction turns", async () => {
    seedDirectoryChatState("/repo", {
      sessionID: "ses_compact",
      messages: [
        {
          info: createUserMessageInfo({
            id: "msg_compaction",
            sessionID: "ses_compact",
            time: { created: 1 },
          }),
          parts: [
            {
              id: "prt_compaction",
              sessionID: "ses_compact",
              messageID: "msg_compaction",
              type: "compaction",
              auto: true,
            },
          ],
        },
        {
          info: createAssistantMessageInfo({
            id: "msg_summary",
            sessionID: "ses_compact",
            parentID: "msg_compaction",
            summary: true,
            time: { created: 2, completed: 3 },
          }),
          parts: [
            {
              id: "prt_summary",
              sessionID: "ses_compact",
              messageID: "msg_summary",
              type: "text",
              text: "Continue with the refactor using the compacted summary.",
            },
          ],
        },
      ],
    })

    await act(async () => {
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    const divider = container.querySelector("[data-session-compaction-divider]")
    expect(divider).not.toBeNull()
    expect(divider?.textContent).toContain("Session compacted")
    expect(container.textContent).toContain(
      "Continue with the refactor using the compacted summary.",
    )
    expect(container.textContent).not.toContain("Compaction")
  })
})
