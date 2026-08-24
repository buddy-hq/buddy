import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatStore } from "../src/state/chat-store"
import {
  applyTranscriptMessageRemoved,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
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

const DIRECTORY = "/repo-content-size"
const SESSION_ID = "ses_content_size"
const TURN_COUNT = 6
const MEASURED_ROW_HEIGHT_PX = 240
const REMOVED_MESSAGE_COUNT = 4
const NEVER_HAS_SCROLL_GESTURE = () => false
const STAYS_DETACHED = () => false

type ResizeObserverHarness = {
  callback: ResizeObserverCallback
  observed: Set<Element>
  observer: ResizeObserver
}

async function flushAnimationFrames() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
  await Promise.resolve()
}

function resizeObserverEntry(target: Element, blockSize: number): ResizeObserverEntry {
  const size: ResizeObserverSize = { blockSize, inlineSize: 1_000 }
  return {
    target,
    contentRect: new DOMRect(0, 0, size.inlineSize, size.blockSize),
    borderBoxSize: [size],
    contentBoxSize: [size],
    devicePixelContentBoxSize: [size],
  }
}

function seedTurns() {
  const messages = Array.from({ length: TURN_COUNT }, (_, index) => {
    const userMessageID = `msg_${String(index * 2 + 1).padStart(3, "0")}_content_user`
    const assistantMessageID = `msg_${String(index * 2 + 2).padStart(3, "0")}_content_assistant`
    return [
      createMessageWithParts(createUserMessageInfo({ id: userMessageID, sessionID: SESSION_ID }), [
        {
          id: `prt_${index}_content_user`,
          sessionID: SESSION_ID,
          messageID: userMessageID,
          type: "text",
          text: `Ask ${index + 1}`,
        },
      ]),
      createMessageWithParts(
        createAssistantMessageInfo({
          id: assistantMessageID,
          sessionID: SESSION_ID,
          parentID: userMessageID,
          finish: "stop",
        }),
        [
          {
            id: `prt_${index}_content_assistant`,
            sessionID: SESSION_ID,
            messageID: assistantMessageID,
            type: "text",
            text: `Answer ${index + 1}`,
          },
        ],
      ),
    ]
  }).flat()
  seedDirectoryChatState(DIRECTORY, { sessionID: SESSION_ID, messages })
  return messages
}

function requireVirtualContent(within: HTMLElement) {
  const row = within.querySelector<HTMLElement>("[data-index]")
  const virtualContent = row?.parentElement?.parentElement
  if (!virtualContent) {
    throw new Error("Expected the virtualized transcript content to be mounted")
  }
  return virtualContent
}

function totalContentHeight(within: HTMLElement) {
  return Number.parseFloat(requireVirtualContent(within).style.height || "0")
}

describe("chat transcript content size reporting", () => {
  let container: HTMLDivElement
  let root: Root
  let transcriptViewport: ChatTranscriptTestViewport
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let resizeObservers: ResizeObserverHarness[]

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    resizeObservers = []
    originalResizeObserver = globalThis.ResizeObserver

    class MockResizeObserver implements ResizeObserver {
      readonly observed = new Set<Element>()

      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push({ callback, observed: this.observed, observer: this })
      }

      observe(target: Element) {
        this.observed.add(target)
      }

      unobserve(target: Element) {
        this.observed.delete(target)
      }

      disconnect() {
        this.observed.clear()
      }
    }

    globalThis.ResizeObserver = MockResizeObserver
    resetTranscriptRepositoryForTests()
    useChatStore.setState({ directories: {} })

    transcriptViewport = createChatTranscriptTestViewport()
    container = document.createElement("div")
    transcriptViewport.ref.current?.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushAnimationFrames()
    })
    useChatStore.setState({ directories: {} })
    resetTranscriptRepositoryForTests()
    transcriptViewport.cleanup()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function emitResize(target: Element, blockSize: number) {
    const entry = resizeObserverEntry(target, blockSize)
    for (const harness of resizeObservers.filter((candidate) => candidate.observed.has(target))) {
      harness.callback([entry], harness.observer)
    }
  }

  test("reports geometry when removed rows shrink the transcript", async () => {
    const messages = seedTurns()
    const reportedRoots: HTMLElement[] = []

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={DIRECTORY}
          scrollViewportRef={transcriptViewport.ref}
          shouldAnchorBottom={STAYS_DETACHED}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
          onContentSizeChange={(element) => {
            reportedRoots.push(element)
          }}
        />,
      )
      await flushAnimationFrames()
    })

    // Mounting only records a baseline: estimated rows and a restored offset that has
    // not been applied yet are not a content change a reader's attachment should follow.
    expect(reportedRoots).toEqual([])

    await act(async () => {
      for (const row of container.querySelectorAll<HTMLElement>("[data-index]")) {
        emitResize(row, MEASURED_ROW_HEIGHT_PX)
      }
      await flushAnimationFrames()
    })

    const measuredHeight = totalContentHeight(container)
    expect(measuredHeight).toBeGreaterThan(0)

    // Nothing that survives the removal re-measures, so `resizeItem` never runs for it.
    reportedRoots.length = 0
    await act(async () => {
      for (const message of messages.slice(-REMOVED_MESSAGE_COUNT)) {
        applyTranscriptMessageRemoved(DIRECTORY, {
          sessionID: SESSION_ID,
          messageID: message.info.id,
        })
      }
      await flushAnimationFrames()
    })

    expect(reportedRoots.length).toBeGreaterThan(0)
    expect(reportedRoots.every((element) => element === transcriptViewport.ref.current)).toBe(true)
    expect(totalContentHeight(container)).toBeLessThan(measuredHeight)
  })
})
