import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { DevToolsTranscriptTab } from "../src/components/debug/devtools-transcript-tab"
import { getTranscriptPerformanceProbe } from "../src/lib/directory-chat/transcript-performance-probe"

function requireButton(container: ParentNode, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected a ${label} button`)
  }
  return button
}

describe("DevToolsTranscriptTab", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    getTranscriptPerformanceProbe()?.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    getTranscriptPerformanceProbe()?.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("starts, displays, and freezes an in-flight render trace", async () => {
    await act(async () => root.render(<DevToolsTranscriptTab />))

    await act(async () => requireButton(container, "Start").click())
    const probe = getTranscriptPerformanceProbe()
    expect(probe?.isRecording()).toBe(true)

    probe?.record({
      type: "render-state",
      at: (probe?.startedAt ?? 0) + 8,
      rowKey: "assistant:math-row",
      mutationCount: 3,
      shell: {
        shellKind: "unknown",
        rowHeight: 180,
        rowTop: 100,
        rowBottom: 280,
        textPreview: "Streaming equation",
        hasToolWrapper: false,
        hasDeferredToolFallback: false,
        hasObjectCard: false,
        hasMermaidLoading: false,
        hasMermaidDiagram: false,
        hasMermaidError: false,
        mathPlaceholderCount: 1,
        katexCount: 0,
        imageCount: 0,
        svgCount: 0,
        iframeCount: 0,
        videoCount: 0,
        audioCount: 0,
        buttonCount: 0,
      },
    })
    probe?.record({
      type: "stream-buffer",
      at: (probe?.startedAt ?? 0) + 9,
      phase: "flush",
      queuedEvents: 24,
      appliedEvents: 4,
    })
    probe?.record({
      type: "stream-buffer",
      at: (probe?.startedAt ?? 0) + 10,
      phase: "session-fence",
      sessionID: "session-1",
      discardedEvents: 3,
    })
    probe?.record({
      type: "stream-buffer",
      at: (probe?.startedAt ?? 0) + 11,
      phase: "session-resume",
      sessionID: "session-1",
      discardedEvents: 2,
    })
    probe?.record({
      type: "row-size",
      at: (probe?.startedAt ?? 0) + 12,
      index: 7,
      rowKey: "activity:terminal-row:1",
      previousSize: 52,
      nextSize: 12,
      deltaPx: -40,
    })

    await act(async () => root.render(<DevToolsTranscriptTab />))
    expect(container.textContent).toContain("DOM render")
    expect(container.textContent).toContain("math 1 placeholder / 0 KaTeX")
    expect(container.textContent).toContain("stream flush")
    expect(container.textContent).toContain("24 queued · 4 applied")
    expect(container.textContent).toContain("24Events queued")
    expect(container.textContent).toContain("4Events applied")
    expect(container.textContent).toContain("stream session-fence")
    expect(container.textContent).toContain("stream session-resume")
    expect(container.textContent).toContain("5Events discarded")
    expect(container.textContent).toContain("1Session fences")
    expect(container.textContent).toContain("Ranked findings")
    expect(container.textContent).toContain("Virtual row collapsed 40.0px")
    expect(container.textContent).toContain("activity:terminal-row:1")
    expect(container.textContent).toContain("Exact evidence from the raw trace")
    expect(container.querySelector("[data-transcript-highlight='row-size:5']")).not.toBeNull()

    await act(async () => requireButton(container, "Stop").click())
    expect(probe?.isRecording()).toBe(false)
    expect(container.textContent).toContain("capture stopped")

    const frozenEventCount = probe?.events.length
    probe?.record({
      type: "bottom-anchor-repair",
      at: (probe?.startedAt ?? 0) + 12,
      distanceFromEnd: 80,
    })
    expect(probe?.events).toHaveLength(frozenEventCount ?? 0)
  })
})
