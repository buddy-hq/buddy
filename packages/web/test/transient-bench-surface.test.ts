import { describe, expect, test } from "bun:test"
import {
  TRANSIENT_BENCH_SURFACE_SKETCH,
  TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  resolveTransientBenchSurfaceLayoutMode,
} from "../src/components/bench/transient-bench-surface"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_MODE_REQUEST_POLICY,
  resolveBenchOpenPolicy,
  resolveBenchSurfaceDefaults,
  type BenchMode,
  type BenchOpenDecision,
  type BenchTarget,
} from "../src/lib/bench-navigation"

const WHITEBOARD_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "current",
} satisfies BenchTarget

const DIRECTORY = "/workspace/buddy"

const NEXT_WHITEBOARD_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-2",
    revisionID: null,
    itemID: null,
  },
  viewID: "current",
} satisfies BenchTarget

const WHITEBOARD_PREVIEW = {
  type: TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  toolKey: "message-1:tool-1",
} as const

const HTML_WIDGET_TARGET = {
  type: "object",
  ref: {
    kind: "html-widget",
    objectID: "widget-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "runtime",
} satisfies BenchTarget

function committedWhiteboardAutoOpen(currentMode: BenchMode): BenchOpenDecision {
  return resolveBenchOpenPolicy({
    request: {
      directory: DIRECTORY,
      target: NEXT_WHITEBOARD_TARGET,
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: {
        policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
        eventKey: "message-1:part-1",
      },
    },
    current: {
      status: "open",
      directory: DIRECTORY,
      target: WHITEBOARD_TARGET,
      mode: currentMode,
      layoutProfile: resolveBenchSurfaceDefaults(WHITEBOARD_TARGET).layoutProfile,
    },
    currentVisible: true,
    defaults: resolveBenchSurfaceDefaults(NEXT_WHITEBOARD_TARGET),
    autoOpenSuppressed: false,
  })
}

describe("transient Bench surface layout", () => {
  test("opens a whiteboard preview docked when the Bench is closed or docked", () => {
    const preview = resolveTransientBenchSurfaceLayoutMode(
      WHITEBOARD_PREVIEW,
      BENCH_CHAT_LAYOUT_DOCKED,
    )
    const closed = resolveBenchOpenPolicy({
      request: {
        directory: DIRECTORY,
        target: WHITEBOARD_TARGET,
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
          eventKey: "message-1:part-1",
        },
      },
      current: { status: "closed" },
      currentVisible: false,
      defaults: resolveBenchSurfaceDefaults(WHITEBOARD_TARGET),
      autoOpenSuppressed: false,
    })
    const docked = committedWhiteboardAutoOpen(BENCH_CHAT_LAYOUT_DOCKED)

    expect(resolveTransientBenchSurfaceLayoutMode(null, BENCH_CHAT_LAYOUT_DOCKED)).toBeNull()
    expect(
      resolveTransientBenchSurfaceLayoutMode(
        TRANSIENT_BENCH_SURFACE_SKETCH,
        BENCH_CHAT_LAYOUT_FLOATING,
      ),
    ).toBe(BENCH_CHAT_LAYOUT_DOCKED)
    expect(closed).toMatchObject({ action: "open", mode: BENCH_CHAT_LAYOUT_DOCKED })
    expect(docked).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      policyID: "preserved-current-mode",
    })
    expect(preview).toBe(BENCH_CHAT_LAYOUT_DOCKED)
    expect(preview).toBe(closed.action === "open" ? closed.mode : null)
    expect(preview).toBe(docked.action === "open" ? docked.mode : null)
    expect(resolveBenchSurfaceDefaults(HTML_WIDGET_TARGET).mode).toBe(BENCH_CHAT_LAYOUT_FLOATING)
  })

  test("keeps a whiteboard preview immersive when the Bench is already immersive", () => {
    const preview = resolveTransientBenchSurfaceLayoutMode(
      WHITEBOARD_PREVIEW,
      BENCH_CHAT_LAYOUT_FLOATING,
    )
    const committed = committedWhiteboardAutoOpen(BENCH_CHAT_LAYOUT_FLOATING)

    expect(committed).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      policyID: "preserved-current-mode",
    })
    expect(preview).toBe(committed.action === "open" ? committed.mode : null)
    expect(
      resolveTransientBenchSurfaceLayoutMode(
        TRANSIENT_BENCH_SURFACE_SKETCH,
        BENCH_CHAT_LAYOUT_FLOATING,
      ),
    ).toBe(BENCH_CHAT_LAYOUT_DOCKED)
  })
})
