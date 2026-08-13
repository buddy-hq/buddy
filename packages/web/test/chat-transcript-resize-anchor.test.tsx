import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  ChatTranscript,
  commitTranscriptVirtualEnd,
  syncVirtualRowGeometry,
} from "../src/components/chat/chat-transcript"
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

function currentRowsByIndex(within: HTMLElement) {
  return Array.from(within.querySelectorAll<HTMLElement>("[data-index]")).toSorted(
    (left, right) => Number(left.dataset.index) - Number(right.dataset.index),
  )
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
    let viewportHeightChanges = 0
    const programmaticScrollOffsets: number[] = []

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          shouldAnchorBottom={shouldAnchorBottom}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
          onViewportHeightChange={() => {
            viewportHeightChanges += 1
          }}
          markProgrammaticScroll={(_, offset) => {
            programmaticScrollOffsets.push(offset)
          }}
        />,
      )
      await flushAnimationFrames()
    })

    const measuredRows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-index]"),
    ).toSorted((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
    const finalRow = requireMeasuredRow(measuredRows.at(-1))
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

    // Re-query: the first batch changes the virtual range, so elements captured
    // before it may no longer be mounted or observed.
    const settledRows = currentRowsByIndex(container)
    const settledFinalRow = requireMeasuredRow(settledRows.at(-1))
    const settledPenultimateRow = requireMeasuredRow(settledRows.at(-2))

    probe.clear()
    await act(async () => {
      emitResize(settledPenultimateRow, 640)
      emitResize(settledFinalRow, 640)
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
    // The invariant that matters while attached: every write moves toward the
    // end. A repair closing a remaining gap is fine; a write that reverses
    // direction inside one measurement batch is the flicker.
    const attachedScrollDeltas = probe.events.flatMap((event) =>
      event.type === "scroll-write" &&
      !event.noOp &&
      event.previousScrollTop !== undefined &&
      event.nextScrollTop !== undefined
        ? [event.nextScrollTop - event.previousScrollTop]
        : [],
    )
    expect(attachedScrollDeltas.length).toBeGreaterThan(0)
    expect(attachedScrollDeltas.filter((delta) => delta < 0)).toEqual([])

    probe.clear()
    await act(async () => {
      emitResize(requireMeasuredRow(currentRowsByIndex(container).at(-1)), 680)
      viewport.scrollTop -= 120
      await waitForResizeBottomRepair()
    })
    expect(probe.events.filter((event) => event.type === "bottom-anchor-repair")).toHaveLength(1)
    expect(probe.events.some((event) => event.type === "scroll-write" && !event.noOp)).toBe(true)
    await act(async () => {
      await flushAnimationFrames()
      await flushAnimationFrames()
    })

    probe.clear()
    const programmaticScrollCountBeforeViewportResize = programmaticScrollOffsets.length
    await act(async () => {
      viewport.scrollTop = 0
      emitResize(viewport, 720)
      await waitForResizeBottomRepair()
    })
    expect(viewportHeightChanges).toBe(1)
    expect(programmaticScrollOffsets).toHaveLength(programmaticScrollCountBeforeViewportResize + 1)
    expect(probe.events.some((event) => event.type === "scroll-write" && !event.noOp)).toBe(true)

    anchorBottom = false
    await act(async () => {
      viewport.scrollTop = 0
      viewport.dispatchEvent(new Event("scroll"))
      await flushAnimationFrames()
    })

    probe.clear()
    await act(async () => {
      // Detached and scrolled to the top, so the mounted range is different
      // again — resize whatever rows are actually mounted.
      const detachedRows = currentRowsByIndex(container)
      emitResize(requireMeasuredRow(detachedRows.at(-2)), 700)
      emitResize(requireMeasuredRow(detachedRows.at(-1)), 720)
      emitResize(viewport, 680)
      await waitForResizeBottomRepair()
    })

    expect(viewportHeightChanges).toBe(2)
    expect(programmaticScrollOffsets).toHaveLength(programmaticScrollCountBeforeViewportResize + 1)
    expect(probe.events.some((event) => event.type === "row-size")).toBe(true)
    expect(probe.events.some((event) => event.type === "scroll-write")).toBe(false)
  })

  test("commits a surface-sized viewport shrink at once and replays it as a transform", async () => {
    const directory = "/repo-anchor-shift"
    const sessionID = "ses_anchor_shift"
    const messages = Array.from({ length: 4 }, (_, index) => {
      const userMessageID = `msg_${String(index * 2 + 1).padStart(3, "0")}_shift_user`
      const assistantMessageID = `msg_${String(index * 2 + 2).padStart(3, "0")}_shift_assistant`
      return [
        createMessageWithParts(createUserMessageInfo({ id: userMessageID, sessionID }), [
          {
            id: `prt_${index}_shift_user`,
            sessionID,
            messageID: userMessageID,
            type: "text",
            text: `Question ${index + 1}`,
          },
        ]),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: assistantMessageID,
            sessionID,
            parentID: userMessageID,
            finish: "stop",
          }),
          [
            {
              id: `prt_${index}_shift_assistant`,
              sessionID,
              messageID: assistantMessageID,
              type: "text",
              text: `Answer ${index + 1}`,
            },
          ],
        ),
      ]
    }).flat()
    seedDirectoryChatState(directory, { sessionID, messages })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          shouldAnchorBottom={() => true}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
        />,
      )
      await flushAnimationFrames()
    })

    const measuredRows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-index]"),
    ).toSorted((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
    const virtualContent = requireMeasuredRow(measuredRows.at(-1)).parentElement?.parentElement
    const viewport = transcriptViewport.ref.current
    if (!virtualContent || !viewport) {
      throw new Error("Expected the transcript viewport and virtual content to remain mounted")
    }

    let viewportHeight = 800
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => viewportHeight },
      scrollHeight: {
        configurable: true,
        get: () => Number.parseFloat(virtualContent.style.height || "0"),
      },
    })

    await act(async () => {
      for (const row of measuredRows) {
        emitResize(row, 240)
      }
      await flushAnimationFrames()
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewportHeight)
      viewport.dispatchEvent(new Event("scroll"))
      await flushAnimationFrames()
    })

    const keyframesByCall: Keyframe[][] = []
    Object.assign(virtualContent, {
      animate: (keyframes: Keyframe[]) => {
        keyframesByCall.push(keyframes)
        return { cancel: () => {}, addEventListener: () => {} }
      },
    })

    probe.clear()
    const scrollTopBeforeShrink = viewport.scrollTop
    act(() => {
      viewportHeight = 480
      emitResize(viewport, 480)
    })

    // The corrected offset lands inside the observer callback, so the transcript
    // never paints a frame at the stale offset.
    expect(probe.events.some((event) => event.type === "scroll-write" && !event.noOp)).toBe(true)
    expect(viewport.scrollTop - scrollTopBeforeShrink).toBe(320)
    expect(keyframesByCall).toEqual([
      [{ transform: "translate3d(0, 320px, 0)" }, { transform: "translate3d(0, 0, 0)" }],
    ])
  })

  test("synchronizes spacer height before writing the virtual end", () => {
    const viewport = document.createElement("div")
    const virtualContent = document.createElement("div")
    const viewportHeight = 800
    const previousTotalSize = 1_200
    const nextTotalSize = 1_516
    let scrollTop = previousTotalSize - viewportHeight

    virtualContent.style.height = `${previousTotalSize}px`
    viewport.append(virtualContent)
    Object.defineProperties(viewport, {
      clientHeight: {
        configurable: true,
        get: () => viewportHeight,
      },
      scrollHeight: {
        configurable: true,
        get: () => Number.parseFloat(virtualContent.style.height),
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
          scrollTop = Math.min(Math.max(0, value), maximum)
        },
      },
    })

    commitTranscriptVirtualEnd({
      root: viewport,
      virtualContent,
      totalSize: nextTotalSize,
      reason: "semantic-row-addition",
    })

    expect(virtualContent.style.height).toBe(`${nextTotalSize}px`)
    expect(viewport.scrollTop).toBe(nextTotalSize - viewportHeight)
  })

  test("mounts the first rows when the transcript is shorter than its viewport", async () => {
    transcriptViewport.cleanup()
    transcriptViewport = createChatTranscriptTestViewport({
      height: 10_000,
      scrollHeight: 10_000,
      clampScrollTop: true,
    })
    transcriptViewport.ref.current?.append(container)

    const directory = "/repo-short-transcript"
    const sessionID = "ses_short_transcript"
    const messages = Array.from({ length: 32 }, (_, index) => {
      const messageID = `msg_${String(index).padStart(3, "0")}_short_transcript`
      return createMessageWithParts(createUserMessageInfo({ id: messageID, sessionID }), [
        {
          id: `prt_${index}_short_transcript`,
          sessionID,
          messageID,
          type: "text",
          text: `Short transcript message ${index + 1}`,
        },
      ])
    })
    seedDirectoryChatState(directory, { sessionID, messages })

    await act(async () => {
      root.render(
        <ChatTranscript
          directory={directory}
          scrollViewportRef={transcriptViewport.ref}
          shouldAnchorBottom={() => true}
          hasScrollGesture={NEVER_HAS_SCROLL_GESTURE}
        />,
      )
      await flushAnimationFrames()
    })

    expect(transcriptViewport.ref.current?.scrollTop).toBe(0)
    expect(container.textContent).toContain("Short transcript message 1")
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

    // The probe records each write's effective target, so a measurement
    // correction reports where it actually lands rather than its pre-adjustment
    // base. Assert the restored offset was used, not that it was written first.
    const scrollWrites = probe.events.flatMap((event) =>
      event.type === "scroll-write" ? [event] : [],
    )
    expect(scrollWrites.length).toBeGreaterThan(0)
    expect(scrollWrites.some((event) => event.requestedOffset === 480)).toBe(true)
    expect(transcriptViewport.ref.current?.scrollTop).toBe(480)
    expect(
      probe.events.some(
        (event) =>
          event.type === "scroll-write" && event.requestedOffset === Number.MAX_SAFE_INTEGER,
      ),
    ).toBe(false)

    await act(async () => {
      await waitForResizeBottomRepair()
    })

    // Settles on the restored offset. Intermediate measurement corrections report
    // their own effective targets, so assert where it lands rather than that
    // every write named the same number.
    const settledWrites = probe.events.flatMap((event) =>
      event.type === "scroll-write" ? [event] : [],
    )
    expect(settledWrites.at(-1)?.requestedOffset).toBe(480)
    expect(transcriptViewport.ref.current?.scrollTop).toBe(480)

    const appendedMessageID = "msg_appended_attached_restored_offset"
    probe.clear()
    await act(async () => {
      seedTranscriptMessages(directory, [
        createMessageWithParts(createUserMessageInfo({ id: appendedMessageID, sessionID }), [
          {
            id: "prt_appended_attached_restored_offset",
            sessionID,
            messageID: appendedMessageID,
            type: "text",
            text: "New material appended after the attached task was restored",
          },
        ]),
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

      expect(probe.events.filter((event) => event.type === "bottom-anchor-repair")).toHaveLength(1)
      expect(
        probe.events.some(
          (event) => event.type === "scroll-write" && !event.noOp && event.requestedOffset > 480,
        ),
      ).toBe(true)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    }
  })
})

// `resizeItem` writes `scrollTop` synchronously and then re-renders through
// React, so the geometry compensating for that write arrives a frame late and
// the transcript paints one frame with the new offset against old positions.
// This is the write that closes the gap; it has to happen without React.
function virtualItem(input: { key: string; index: number; start: number; size: number }) {
  return {
    key: input.key,
    index: input.index,
    start: input.start,
    size: input.size,
    end: input.start + input.size,
    lane: 0,
  }
}

describe("virtual row geometry sync", () => {
  test("writes height and position for every mounted row", () => {
    const first = document.createElement("div")
    const second = document.createElement("div")
    const wrappers = new Map<string, HTMLElement>([
      ["row:a", first],
      ["row:b", second],
    ])

    syncVirtualRowGeometry(
      [
        virtualItem({ key: "row:a", index: 0, start: 0, size: 88 }),
        virtualItem({ key: "row:b", index: 1, start: 88, size: 136 }),
      ],
      wrappers,
    )

    expect(first.style.height).toBe("88px")
    expect(first.style.transform).toBe("translateY(0px)")
    expect(second.style.height).toBe("136px")
    expect(second.style.transform).toBe("translateY(88px)")
  })

  test("moves rows below a row that grew", () => {
    const below = document.createElement("div")
    const wrappers = new Map<string, HTMLElement>([["row:b", below]])

    syncVirtualRowGeometry([virtualItem({ key: "row:b", index: 1, start: 88, size: 88 })], wrappers)
    expect(below.style.transform).toBe("translateY(88px)")

    // The row above grew by one prose line; the follower must move with it in
    // this same call, not on the next React commit.
    syncVirtualRowGeometry([virtualItem({ key: "row:b", index: 1, start: 112, size: 88 })], wrappers)
    expect(below.style.transform).toBe("translateY(112px)")
  })

  test("ignores rows that are not mounted", () => {
    expect(() =>
      syncVirtualRowGeometry(
        [virtualItem({ key: "row:missing", index: 0, start: 0, size: 48 })],
        new Map(),
      ),
    ).not.toThrow()
  })
})
