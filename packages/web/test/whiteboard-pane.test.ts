import { describe, expect, test } from "bun:test"
import {
  resolveWhiteboardCanvasKey,
  resolveWhiteboardCanvasViewport,
  resolveWhiteboardRenderReportKey,
  resolveWhiteboardShareBoard,
  shouldRetainProgressiveWhiteboardPreview,
  shouldRefetchWhiteboardAfterBusyChange,
} from "../src/components/whiteboard/whiteboard-pane"
import type { PersistedWhiteboardElement } from "../src/components/whiteboard/whiteboard-elements"

const previewElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "preview", x: 0, y: 0, width: 120, height: 80 },
]
const latestElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "latest", x: 0, y: 0, width: 120, height: 80 },
]
const draftElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "draft", x: 0, y: 0, width: 120, height: 80 },
]

describe("whiteboard pane state helpers", () => {
  test("keeps one canvas instance for the full chat session", () => {
    const firstEditable = resolveWhiteboardCanvasKey({
      sessionID: "session",
    })
    const secondEditable = resolveWhiteboardCanvasKey({
      sessionID: "session",
    })
    const firstPreview = resolveWhiteboardCanvasKey({
      sessionID: "session",
    })
    const otherSession = resolveWhiteboardCanvasKey({
      sessionID: "other-session",
    })

    expect(firstEditable).toBe(secondEditable)
    expect(firstEditable).toBe(firstPreview)
    expect(firstEditable).not.toBe(otherSession)
  })

  test("preserves the visible viewport across same-session generation transitions", () => {
    const boardViewport = { x: 0, y: 0, width: 800, height: 600 }
    const liveViewport = { x: 120, y: 80, width: 400, height: 300 }

    expect(
      resolveWhiteboardCanvasViewport({
        sessionID: "session",
        liveViewport: {
          sessionID: "session",
          viewport: liveViewport,
        },
        boardViewport,
      }),
    ).toBe(liveViewport)
    expect(
      resolveWhiteboardCanvasViewport({
        sessionID: "other-session",
        liveViewport: {
          sessionID: "session",
          viewport: liveViewport,
        },
        boardViewport,
      }),
    ).toBe(boardViewport)
  })

  test("shares the editable live draft before the fetched latest board", () => {
    const latest = { elements: latestElements }
    const draft = {
      elements: draftElements,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
    }

    expect(
      resolveWhiteboardShareBoard({
        liveDraftBoard: draft,
        latestBoard: latest,
      }),
    ).toBe(draft)
  })

  test("shares the fetched latest board before the displayed fallback", () => {
    const latest = { elements: latestElements }
    const displayed = { elements: previewElements }

    expect(
      resolveWhiteboardShareBoard({
        displayedBoard: displayed,
        latestBoard: latest,
      }),
    ).toBe(latest)
  })

  test("refetches the board when an active turn becomes idle", () => {
    expect(
      shouldRefetchWhiteboardAfterBusyChange({
        sessionID: "session",
        wasBusy: true,
        isBusy: false,
      }),
    ).toBe(true)
    expect(
      shouldRefetchWhiteboardAfterBusyChange({
        sessionID: "session",
        wasBusy: false,
        isBusy: false,
      }),
    ).toBe(false)
    expect(
      shouldRefetchWhiteboardAfterBusyChange({
        wasBusy: true,
        isBusy: false,
      }),
    ).toBe(false)
  })

  test("does not retain a failed progressive preview after the turn becomes idle", () => {
    expect(
      shouldRetainProgressiveWhiteboardPreview({
        hasActiveWhiteboardCreateTool: false,
        hasUnfetchedCompletedWhiteboardCreateTool: false,
        hasLatestFailedWhiteboardCreateTool: true,
        isBusy: true,
      }),
    ).toBe(true)
    expect(
      shouldRetainProgressiveWhiteboardPreview({
        hasActiveWhiteboardCreateTool: false,
        hasUnfetchedCompletedWhiteboardCreateTool: false,
        hasLatestFailedWhiteboardCreateTool: true,
        isBusy: false,
      }),
    ).toBe(false)
  })

  test("changes render report key when same board id is saved again", () => {
    expect(
      resolveWhiteboardRenderReportKey({
        boardID: "board",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe("board:2026-06-02T00:00:00.000Z")
    expect(
      resolveWhiteboardRenderReportKey({
        boardID: "board",
        updatedAt: "2026-06-02T00:00:01.000Z",
      }),
    ).toBe("board:2026-06-02T00:00:01.000Z")
    expect(resolveWhiteboardRenderReportKey({ boardID: "board" })).toBeUndefined()
  })
})
