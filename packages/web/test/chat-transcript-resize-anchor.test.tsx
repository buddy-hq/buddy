import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ChatTranscript } from "../src/components/chat/chat-transcript"
import {
  installTranscriptPerformanceProbe,
  type TranscriptPerformanceProbe,
} from "../src/lib/directory-chat/transcript-performance-probe"
import { useChatStore } from "../src/state/chat-store"
import { BUSY_SESSION_STATUS } from "../src/state/session-status"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
  seedTranscriptMessages,
} from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"

type ResizeObserverHarness = {
  callback: ResizeObserverCallback
  observed: Set<Element>
  observer: ResizeObserver
}

const NEVER_HAS_SCROLL_GESTURE = () => false

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

async function flushAnimationFrames() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
  await Promise.resolve()
}

async function waitForResizeBottomRepair() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 150)
  })
  await flushAnimationFrames()
}

function requireMeasuredRow(element: HTMLElement | undefined) {
  if (!element) {
    throw new Error("Expected the virtualized transcript row to be mounted")
  }
  return element
}

describe("chat transcript resize anchoring", () => {
  let container: HTMLDivElement
  let root: Root
  let transcriptViewport: ChatTranscriptTestViewport
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let resizeObservers: ResizeObserverHarness[]
  let probe: TranscriptPerformanceProbe

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
    probe = installTranscriptPerformanceProbe({ observeBrowserEvents: false })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushAnimationFrames()
    })
    probe.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
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
    const matchingObservers = resizeObservers.filter((harness) => harness.observed.has(target))
    expect(matchingObservers.length).toBeGreaterThan(0)
    for (const harness of matchingObservers) {
      harness.callback([entry], harness.observer)
    }
  }

  test("reanchors attached resize batches without pulling a detached viewport", async () => {
    const directory = "/repo-resize-anchor"
    const sessionID = "ses_resize_anchor"
    const turnCount = 6
    const messages = Array.from({ length: turnCount }, (_, index) => {
      const userMessageID = `msg_${String(index * 2 + 1).padStart(3, "0")}_resize_user`
      const assistantMessageID = `msg_${String(index * 2 + 2).padStart(3, "0")}_resize_assistant`
      return [
        createMessageWithParts(createUserMessageInfo({ id: userMessageID, sessionID }), [
          {
            id: `prt_${index}_resize_user`,
            sessionID,
            messageID: userMessageID,
            type: "text",
            text: `Render result ${index + 1}`,
          },
        ]),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: assistantMessageID,
            sessionID,
            parentID: userMessageID,
            finish: index === turnCount - 1 ? undefined : "stop",
          }),
          [
            {
              id: `prt_${index}_resize_assistant`,
              sessionID,
              messageID: assistantMessageID,
              type: "text",
              text: `Prepared result ${index + 1}`,
            },
          ],
        ),
      ]
    }).flat()
    seedDirectoryChatState(directory, {
      sessionID,
      isBusy: true,
      sessionStatusByID: { [sessionID]: BUSY_SESSION_STATUS },
      messages,
    })

    let anchorBottom = true
    const shouldAnchorBottom = () => anchorBottom

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          shouldAnchorBottom={shouldAnchorBottom}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
        />,
      )
      await flushAnimationFrames()
    })

    const measuredRows = Array.from(container.querySelectorAll<HTMLElement>("[data-index]")).toSorted(
      (left, right) => Number(left.dataset.index) - Number(right.dataset.index),
    )
    const finalRow = requireMeasuredRow(measuredRows.at(-1))
    const penultimateRow = requireMeasuredRow(measuredRows.at(-2))
    const virtualContent = finalRow.parentElement?.parentElement
    const viewport = transcriptViewport.ref.current
    if (!virtualContent || !viewport) {
      throw new Error("Expected the transcript viewport and virtual content to remain mounted")
    }
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get: () => Number.parseFloat(virtualContent.style.height || "0"),
    })

    await act(async () => {
      for (const row of measuredRows) {
        emitResize(row, 240)
      }
      await flushAnimationFrames()
      const totalSize = Number.parseFloat(virtualContent.style.height || "0")
      viewport.scrollTop = Math.max(0, totalSize - viewport.clientHeight)
      viewport.dispatchEvent(new Event("scroll"))
      await flushAnimationFrames()
    })

    probe.clear()
    await act(async () => {
      emitResize(penultimateRow, 640)
      emitResize(finalRow, 640)
      await waitForResizeBottomRepair()
    })

    expect(
      probe.events.some(
        (event) => event.type === "row-size" && event.nextSize === 640 && !event.ignored,
      ),
    ).toBe(true)
    const finalResizeEventIndex = probe.events.findLastIndex(
      (event) => event.type === "row-size" && event.nextSize === 640,
    )
    expect(finalResizeEventIndex).toBeGreaterThanOrEqual(0)
    expect(
      probe.events.slice(finalResizeEventIndex + 1).some((event) => event.type === "scroll-write"),
    ).toBe(true)
    expect(
      probe.events.filter((event) => event.type === "bottom-anchor-repair"),
    ).toHaveLength(0)

    probe.clear()
    await act(async () => {
      emitResize(finalRow, 680)
      viewport.scrollTop -= 120
      await waitForResizeBottomRepair()
    })
    expect(
      probe.events.filter((event) => event.type === "bottom-anchor-repair"),
    ).toHaveLength(1)
    expect(probe.events.some((event) => event.type === "scroll-write" && !event.noOp)).toBe(true)
    await act(async () => {
      await flushAnimationFrames()
      await flushAnimationFrames()
    })

    anchorBottom = false
    await act(async () => {
      viewport.scrollTop = 0
      viewport.dispatchEvent(new Event("scroll"))
      await flushAnimationFrames()
    })

    probe.clear()
    await act(async () => {
      emitResize(penultimateRow, 700)
      emitResize(finalRow, 720)
      await waitForResizeBottomRepair()
    })

    expect(probe.events.some((event) => event.type === "row-size")).toBe(true)
    expect(probe.events.some((event) => event.type === "scroll-write")).toBe(false)
  })

  test("uses a restored detached offset for its initial virtualizer position", async () => {
    const directory = "/repo-restored-offset"
    const sessionID = "ses_restored_offset"
    const messages = Array.from({ length: 8 }, (_, index) => {
      const messageID = `msg_${String(index).padStart(3, "0")}_restored_offset`
      return createMessageWithParts(createUserMessageInfo({ id: messageID, sessionID }), [
        {
          id: `prt_${index}_restored_offset`,
          sessionID,
          messageID,
          type: "text",
          text: `Previous reading material ${index + 1}`,
        },
      ])
    })
    seedDirectoryChatState(directory, { sessionID, messages })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          initialScrollOffset={() => 320}
          shouldAnchorBottom={() => false}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
        />,
      )
      await flushAnimationFrames()
    })

    expect(transcriptViewport.ref.current?.scrollTop).toBe(320)
  })

  test("starts an attached revisit from its finite offset instead of the end sentinel", async () => {
    const directory = "/repo-attached-restored-offset"
    const sessionID = "ses_attached_restored_offset"
    const messages = Array.from({ length: 8 }, (_, index) => {
      const messageID = `msg_${String(index).padStart(3, "0")}_attached_restored_offset`
      return createMessageWithParts(createUserMessageInfo({ id: messageID, sessionID }), [
        {
          id: `prt_${index}_attached_restored_offset`,
          sessionID,
          messageID,
          type: "text",
          text: `Recent attached material ${index + 1}`,
        },
      ])
    })
    seedDirectoryChatState(directory, { sessionID, messages })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          initialScrollOffset={() => 480}
          shouldAnchorBottom={() => true}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
        />,
      )
      await flushAnimationFrames()
    })

    const firstScrollWrite = probe.events.find((event) => event.type === "scroll-write")
    expect(firstScrollWrite?.type).toBe("scroll-write")
    if (firstScrollWrite?.type !== "scroll-write") {
      throw new Error("Expected the attached transcript to write its initial offset")
    }
    expect(firstScrollWrite.requestedOffset).toBe(480)
    expect(
      probe.events.some(
        (event) =>
          event.type === "scroll-write" && event.requestedOffset === Number.MAX_SAFE_INTEGER,
      ),
    ).toBe(false)

    await act(async () => {
      await waitForResizeBottomRepair()
    })

    expect(
      Array.from(
        new Set(
          probe.events
            .filter((event) => event.type === "scroll-write")
            .map((event) => event.requestedOffset),
        ),
      ),
    ).toEqual([480])

    const appendedMessageID = "msg_appended_attached_restored_offset"
    probe.clear()
    await act(async () => {
      seedTranscriptMessages(directory, [
        createMessageWithParts(
          createUserMessageInfo({ id: appendedMessageID, sessionID }),
          [
            {
              id: "prt_appended_attached_restored_offset",
              sessionID,
              messageID: appendedMessageID,
              type: "text",
              text: "New material appended after the attached task was restored",
            },
          ],
        ),
      ])
      await flushAnimationFrames()
    })

    expect(probe.events.some((event) => event.type === "scroll-write")).toBe(true)
  })

  test("repairs a restored attached offset after cached geometry settles", async () => {
    const directory = "/repo-stale-attached-offset"
    const sessionID = "ses_stale_attached_offset"
    const messages = Array.from({ length: 8 }, (_, index) => {
      const messageID = `msg_${String(index).padStart(3, "0")}_stale_attached_offset`
      return createMessageWithParts(createUserMessageInfo({ id: messageID, sessionID }), [
        {
          id: `prt_${index}_stale_attached_offset`,
          sessionID,
          messageID,
          type: "text",
          text: `Attached material with cached geometry ${index + 1}`,
        },
      ])
    })
    seedDirectoryChatState(directory, { sessionID, messages })

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-index")) return new DOMRect(0, 0, 1_000, 240)
      return originalGetBoundingClientRect.call(this)
    }

    try {
      await act(async () => {
        root.render(
          <ChatTranscript
            directory={directory}
            scrollViewportRef={transcriptViewport.ref}
            initialScrollOffset={() => 480}
            shouldAnchorBottom={() => true}
            hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
          />,
        )
        await flushAnimationFrames()
      })

      expect(transcriptViewport.ref.current?.scrollTop).toBe(480)
      probe.clear()

      await act(async () => {
        await waitForResizeBottomRepair()
      })

      expect(
        probe.events.filter((event) => event.type === "bottom-anchor-repair"),
      ).toHaveLength(1)
      expect(
        probe.events.some(
          (event) =>
            event.type === "scroll-write" &&
            !event.noOp &&
            event.requestedOffset > 480,
        ),
      ).toBe(true)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    }
  })

})
