import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { requestNoteMessageNavigation } from "../src/features/notes/chat-message-navigation"
import { requestCitationNavigation } from "../src/lib/citations/navigation"
import { useChatStore } from "../src/state/chat-store"
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

const DIRECTORY = "/repo/bench-session-target"
const ROOT_SESSION_ID = "root-session"
const CHILD_SESSION_ID = "child-session"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for citation navigation")
    await flushEffects()
  }
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

  test("opens and reveals a chat citation from the source session after a fork", async () => {
    const sourceExcerpt = "source answer"
    const sourceMessageID = "source-assistant-message"
    const sourcePartID = "source-assistant-part"
    const sourceMessages = [
      createMessageWithParts(
        createUserMessageInfo({ id: "source-user-message", sessionID: ROOT_SESSION_ID }),
        [
          {
            id: "source-user-part",
            sessionID: ROOT_SESSION_ID,
            messageID: "source-user-message",
            type: "text",
            text: "Give me the source",
          },
        ],
      ),
      createMessageWithParts(
        createAssistantMessageInfo({
          id: sourceMessageID,
          sessionID: ROOT_SESSION_ID,
          parentID: "source-user-message",
        }),
        [
          {
            id: sourcePartID,
            sessionID: ROOT_SESSION_ID,
            messageID: sourceMessageID,
            type: "text",
            text: `Original ${sourceExcerpt} text`,
          },
        ],
      ),
    ]
    const forkedMessages = [
      createMessageWithParts(
        createUserMessageInfo({ id: "fork-user-message", sessionID: CHILD_SESSION_ID }),
        [
          {
            id: "fork-user-part",
            sessionID: CHILD_SESSION_ID,
            messageID: "fork-user-message",
            type: "text",
            text: "Give me the source",
          },
        ],
      ),
      createMessageWithParts(
        createAssistantMessageInfo({
          id: "fork-assistant-message",
          sessionID: CHILD_SESSION_ID,
          parentID: "fork-user-message",
        }),
        [
          {
            id: "fork-assistant-part",
            sessionID: CHILD_SESSION_ID,
            messageID: "fork-assistant-message",
            type: "text",
            text: `Original ${sourceExcerpt} text`,
          },
        ],
      ),
    ]
    const openedSessionIDs: string[] = []
    const revealedCitationPartIDs: string[] = []
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function () {
      const citationPartID = this.dataset.citationPart
      if (citationPartID) revealedCitationPartIDs.push(citationPartID)
    }

    seedDirectoryChatState(DIRECTORY, {
      sessionID: CHILD_SESSION_ID,
      messagesBySessionID: {
        [ROOT_SESSION_ID]: sourceMessages,
        [CHILD_SESSION_ID]: forkedMessages,
      },
    })
    transcriptViewport.ref.current?.append(container)

    function renderSession(sessionID: string) {
      root.render(
        <ChatTranscript
          directory={DIRECTORY}
          sessionID={sessionID}
          scrollViewportRef={transcriptViewport.ref}
          onOpenSession={(nextSessionID) => {
            openedSessionIDs.push(nextSessionID)
            renderSession(nextSessionID)
          }}
        />,
      )
    }

    await act(async () => {
      renderSession(CHILD_SESSION_ID)
      await flushEffects()
    })

    let opened = false
    try {
      await act(async () => {
        opened = await requestCitationNavigation({
          schemaVersion: 1,
          id: "citation-from-before-fork",
          excerpt: sourceExcerpt,
          source: {
            kind: "chat",
            sessionID: ROOT_SESSION_ID,
            messageID: sourceMessageID,
            partID: sourcePartID,
            selector: {
              version: 1,
              start: 9,
              end: 22,
              prefix: "Original ",
              suffix: " text",
            },
          },
        })
        await flushEffects()
      })
      await waitFor(() => revealedCitationPartIDs.includes(sourcePartID))
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }

    expect(opened).toBe(true)
    expect(openedSessionIDs).toEqual([ROOT_SESSION_ID])
    expect(container.querySelector(`[data-citation-part="${sourcePartID}"]`)).not.toBeNull()
    expect(revealedCitationPartIDs).toContain(sourcePartID)
  })

  test("reveals the linked assistant message inside a multi-step turn", async () => {
    const userMessageID = "note-1-user"
    const firstAssistantID = "note-2-assistant"
    const secondAssistantID = "note-3-assistant"
    const assistantMessage = (id: string, text: string) =>
      createMessageWithParts(
        createAssistantMessageInfo({ id, sessionID: ROOT_SESSION_ID, parentID: userMessageID }),
        [{ id: `${id}-part`, sessionID: ROOT_SESSION_ID, messageID: id, type: "text", text }],
      )
    const revealedRowText: string[] = []
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function () {
      if (this.dataset.index !== undefined) revealedRowText.push(this.textContent ?? "")
    }

    seedDirectoryChatState(DIRECTORY, {
      sessionID: ROOT_SESSION_ID,
      messagesBySessionID: {
        [ROOT_SESSION_ID]: [
          createMessageWithParts(
            createUserMessageInfo({ id: userMessageID, sessionID: ROOT_SESSION_ID }),
            [
              {
                id: "note-user-part",
                sessionID: ROOT_SESSION_ID,
                messageID: userMessageID,
                type: "text",
                text: "Walk me through it",
              },
            ],
          ),
          assistantMessage(firstAssistantID, "First step answer"),
          assistantMessage(secondAssistantID, "Second step answer"),
        ],
      },
    })
    transcriptViewport.ref.current?.append(container)

    try {
      await act(async () => {
        root.render(
          <ChatTranscript
            directory={DIRECTORY}
            sessionID={ROOT_SESSION_ID}
            scrollViewportRef={transcriptViewport.ref}
          />,
        )
        await flushEffects()
      })
      await act(async () => {
        await requestNoteMessageNavigation({
          directory: DIRECTORY,
          sessionID: ROOT_SESSION_ID,
          messageID: secondAssistantID,
        })
        await flushEffects()
      })
      await waitFor(() => revealedRowText.length > 0)
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }

    expect(revealedRowText[0]).toContain("Second step answer")
    expect(revealedRowText[0]).not.toContain("First step answer")
  })
})
