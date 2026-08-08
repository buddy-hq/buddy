import { describe, expect, test } from "bun:test"
import {
  resolveWhiteboardCanvasKey,
  resolveWhiteboardCanvasViewport,
  resolveWhiteboardLeaveSettlement,
  resolveWhiteboardRenderReportKey,
  resolveWhiteboardShareBoard,
  shouldPollWhiteboardDuringActiveCreate,
  shouldPreferFetchedBoardDuringActiveCreate,
  shouldRetainProgressiveWhiteboardPreview,
  shouldRefetchWhiteboardAfterBusyChange,
  shouldShowWhiteboardOpeningAnimation,
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
  test("allows settled saves and blocks every unresolved learner-save outcome", () => {
    expect(resolveWhiteboardLeaveSettlement(undefined)).toEqual({ status: "allow" })
    expect(resolveWhiteboardLeaveSettlement({ status: "clean" })).toEqual({ status: "allow" })
    expect(resolveWhiteboardLeaveSettlement({ status: "saved" })).toEqual({ status: "allow" })
    expect(resolveWhiteboardLeaveSettlement({ status: "conflict" })).toMatchObject({
      status: "block",
      reason: "conflict",
    })
    expect(resolveWhiteboardLeaveSettlement({ status: "save-error" })).toMatchObject({
      status: "block",
      reason: "save_error",
    })
    expect(resolveWhiteboardLeaveSettlement({ status: "still-saving" })).toMatchObject({
      status: "block",
      reason: "saving",
    })
  })

  test("keeps one canvas instance for the full whiteboard object", () => {
    const firstEditable = resolveWhiteboardCanvasKey({
      objectID: "session",
    })
    const secondEditable = resolveWhiteboardCanvasKey({
      objectID: "session",
    })
    const firstPreview = resolveWhiteboardCanvasKey({
      objectID: "session",
    })
    const otherObject = resolveWhiteboardCanvasKey({
      objectID: "other-session",
    })

    expect(firstEditable).toBe(secondEditable)
    expect(firstEditable).toBe(firstPreview)
    expect(firstEditable).not.toBe(otherObject)
  })

  test("preserves the visible viewport across same-object generation transitions", () => {
    const boardViewport = { x: 0, y: 0, width: 800, height: 600 }
    const liveViewport = { x: 120, y: 80, width: 400, height: 300 }

    expect(
      resolveWhiteboardCanvasViewport({
        objectID: "session",
        liveViewport: {
          objectID: "session",
          viewport: liveViewport,
        },
        boardViewport,
      }),
    ).toBe(liveViewport)
    expect(
      resolveWhiteboardCanvasViewport({
        objectID: "other-session",
        liveViewport: {
          objectID: "session",
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
        objectID: "session",
        wasBusy: true,
        isBusy: false,
      }),
    ).toBe(true)
    expect(
      shouldRefetchWhiteboardAfterBusyChange({
        objectID: "session",
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

  test("polls current board state only while an active whiteboard create is visible", () => {
    expect(
      shouldPollWhiteboardDuringActiveCreate({
        objectID: "session",
        hasActiveWhiteboardCreateTool: true,
      }),
    ).toBe(true)
    expect(
      shouldPollWhiteboardDuringActiveCreate({
        objectID: "session",
        hasActiveWhiteboardCreateTool: false,
      }),
    ).toBe(false)
    expect(
      shouldPollWhiteboardDuringActiveCreate({
        hasActiveWhiteboardCreateTool: true,
      }),
    ).toBe(false)
  })

  test("shows the opening animation for a transient board before its first streamed element", () => {
    expect(
      shouldShowWhiteboardOpeningAnimation({
        hasDisplayedBoard: false,
        hasActiveWhiteboardCreateTool: true,
        isBusy: false,
      }),
    ).toBe(true)
    expect(
      shouldShowWhiteboardOpeningAnimation({
        hasDisplayedBoard: false,
        hasActiveWhiteboardCreateTool: false,
        isBusy: true,
      }),
    ).toBe(true)
    expect(
      shouldShowWhiteboardOpeningAnimation({
        hasDisplayedBoard: false,
        hasActiveWhiteboardCreateTool: false,
        isBusy: false,
      }),
    ).toBe(false)
    expect(
      shouldShowWhiteboardOpeningAnimation({
        hasDisplayedBoard: true,
        hasActiveWhiteboardCreateTool: true,
        isBusy: true,
      }),
    ).toBe(false)
  })

  test("prefers the fetched board during active create only after the durable board advances", () => {
    expect(
      shouldPreferFetchedBoardDuringActiveCreate({
        activeBase: { boardID: "old-board" },
        currentBoardID: "new-board",
        hasActiveWhiteboardCreateTool: true,
      }),
    ).toBe(true)
    expect(
      shouldPreferFetchedBoardDuringActiveCreate({
        activeBase: { boardID: "old-board" },
        currentBoardID: "old-board",
        hasActiveWhiteboardCreateTool: true,
      }),
    ).toBe(false)
    expect(
      shouldPreferFetchedBoardDuringActiveCreate({
        activeBase: { boardID: "old-board" },
        currentBoardID: "new-board",
        hasActiveWhiteboardCreateTool: false,
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
