import { describe, expect, test } from "bun:test"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import {
  applyWhiteboardDrawingProgram,
  parseDrawingProgram,
} from "../../src/learning/features/whiteboard/service/program"
import {
  readWhiteboardSession,
  saveWhiteboardLearnerEdit,
  saveWhiteboardRenderReport,
} from "../../src/learning/features/whiteboard/service/store"
import {
  WhiteboardPayloadTooLargeError,
  WhiteboardStaleLearnerEditError,
  WhiteboardStaleWriteError,
} from "../../src/learning/features/whiteboard/errors"
import { MAX_WHITEBOARD_PAYLOAD_BYTES } from "../../src/learning/features/whiteboard/service/payload"
import {
  createWhiteboardViewTool,
  readWhiteboardContextTool,
} from "../../src/learning/features/whiteboard/tools/tools"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { tmpdir } from "../helpers/tmpdir"

function createContext(input: { directory: string; sessionID: string }): BuddyToolContext {
  return {
    directory: input.directory,
    sessionID: SessionID.make(input.sessionID),
    messageID: MessageID.make("msg_whiteboard"),
    agent: "buddy",
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    ask: async () => {},
  }
}

describe("whiteboard drawing program", () => {
  test("creates, continues, and replaces the current board", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
        { type: "rectangle", id: "solid", x: 80, y: 100, width: 160, height: 80 },
        {
          type: "arrow",
          id: "melting",
          x: 240,
          y: 140,
          width: 140,
          height: 0,
          points: [
            [0, 0],
            [140, 0],
          ],
        },
      ]),
    })

    const continued = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: created.continuationHandle },
        { type: "delete", id: "melting" },
        {
          type: "arrow",
          id: "melting-with-heat",
          x: 240,
          y: 140,
          width: 140,
          height: 0,
          points: [
            [0, 0],
            [140, 0],
          ],
        },
      ]),
    })

    expect(continued.continuationHandle).toBe("current")
    expect(continued.state.currentBoard?.elements.map((element) => element.id)).toEqual([
      "solid",
      "melting-with-heat",
    ])
    expect(continued.state.currentBoard?.viewport).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })

    const replaced = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      elements: JSON.stringify([
        { type: "rectangle", id: "replacement", x: 20, y: 20, width: 100, height: 60 },
      ]),
    })

    expect(replaced.state.currentBoard?.elements.map((element) => element.id)).toEqual([
      "replacement",
    ])
  })

  test("rejects invalid current-board continuation handles", async () => {
    await using project = await tmpdir()
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_continuation_handle",
      elements: JSON.stringify([
        { type: "rectangle", id: "base", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_invalid_continuation_handle",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "old-scene" },
          { type: "text", id: "should-not-save", x: 0, y: 90, text: "No" },
        ]),
      }),
    ).rejects.toThrow('Invalid restoreCheckpoint at index 0: expected id "current"')

    const state = await readWhiteboardSession(project.path, "ses_invalid_continuation_handle")
    expect(state.currentBoard?.elements.map((element) => element.id)).toEqual(["base"])
  })

  test("returns a recoverable camera aspect-ratio hint", async () => {
    await using project = await tmpdir()
    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_camera_hint",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 500, height: 500, x: 0, y: 0 },
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    expect(result.warnings.join("\n")).toContain("cameraUpdate used 500x500")
    expect(result.state.currentBoard?.viewport).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    })
  })

  test("returns compact model-facing warnings for layout overlaps", async () => {
    await using project = await tmpdir()

    const result = await createWhiteboardViewTool.run(
      {
        elements: JSON.stringify([
          { type: "rectangle", id: "box_a", x: 0, y: 0, width: 100, height: 70 },
          { type: "rectangle", id: "box_b", x: 50, y: 20, width: 100, height: 70 },
        ]),
      },
      createContext({ directory: project.path, sessionID: "ses_layout_warning_tool" }),
    )

    expect(result.output).toContain("WHITEBOARD LAYOUT REPAIR SUGGESTED BEFORE REPLYING.")
    expect(result.output).toContain('"ss","box_a","box_b"')
    expect(result.metadata?.layoutWarnings).toMatchObject({
      total: 1,
      hard: [["ss", "box_a", "box_b"]],
      advisory: [],
      hidden: 0,
      action: "roomy_relayout_once_before_reply",
    })
  })

  test("translates existing elements and related bound text", async () => {
    await using project = await tmpdir()
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_translate",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "node",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { text: "Node" },
        },
        {
          type: "text",
          id: "node-bound-text",
          containerId: "node",
          x: 20,
          y: 20,
          text: "Node",
        },
      ]),
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_translate",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "translate", ids: "node", dx: 100, dy: 50 },
      ]),
    })

    expect(result.state.currentBoard?.elements).toEqual([
      {
        type: "rectangle",
        id: "node",
        x: 100,
        y: 50,
        width: 120,
        height: 80,
        label: { text: "Node" },
      },
      {
        type: "text",
        id: "node-bound-text",
        containerId: "node",
        x: 120,
        y: 70,
        text: "Node",
      },
    ])
  })

  test("learner autosave updates the current checkpoint in place", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_learner_edit",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 20, y: 30, width: 120, height: 60 },
      ]),
    })

    const first = await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_learner_edit",
      edit: {
        baseBoardID: created.boardID,
        elements: [{ type: "rectangle", id: "node", x: 90, y: 110, width: 120, height: 60 }],
      },
    })
    const firstBoardID = first.currentBoard?.boardID
    expect(firstBoardID).toBeString()

    const second = await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_learner_edit",
      edit: {
        baseBoardID: firstBoardID ?? "",
        elements: [{ type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 }],
      },
    })

    expect(firstBoardID).toBe(created.boardID)
    expect(second.currentBoard?.boardID).toBe(created.boardID)
    expect(second.currentBoard?.elements).toEqual([
      { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
    ])

    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_learner_edit",
        edit: {
          baseBoardID: second.currentBoard?.boardID ?? "",
          elements: [
            {
              type: "text",
              id: "oversized-note",
              x: 0,
              y: 0,
              text: "x".repeat(MAX_WHITEBOARD_PAYLOAD_BYTES),
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(WhiteboardPayloadTooLargeError)
  })

  test("allows clearing the current checkpoint with an empty learner autosave", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_empty_learner_autosave",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_empty_learner_autosave",
      edit: {
        baseBoardID: created.boardID,
        elements: [],
      },
    })

    const state = await readWhiteboardSession(project.path, "ses_empty_learner_autosave")
    expect(state.currentBoard?.boardID).toBe(created.boardID)
    expect(state.currentBoard?.elements).toEqual([])
  })

  test("rejects learner autosaves based on an older agent board", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_learner_autosave",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    const updated = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_learner_autosave",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "text", id: "agent-note", x: 0, y: 100, text: "Agent addition" },
      ]),
    })

    await expect(
      saveWhiteboardLearnerEdit({
        directory: project.path,
        sessionID: "ses_stale_learner_autosave",
        edit: {
          baseBoardID: created.boardID,
          elements: [{ type: "rectangle", id: "node", x: 40, y: 0, width: 120, height: 60 }],
        },
      }),
    ).rejects.toBeInstanceOf(WhiteboardStaleLearnerEditError)

    const state = await readWhiteboardSession(project.path, "ses_stale_learner_autosave")
    expect(state.currentBoard?.boardID).toBe(updated.boardID)
    expect(state.currentBoard?.elements.map((element) => element.id)).toEqual([
      "node",
      "agent-note",
    ])
  })

  test("stores render reports only for the current board without exposing them in session reads", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_report",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    const saved = await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_report",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 120, height: 60 },
        elements: [
          {
            id: "node",
            type: "rectangle",
            version: 1,
            versionNonce: 11,
            bounds: { x: 0, y: 0, width: 120, height: 60 },
          },
        ],
      },
    })
    const stale = await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_report",
      report: {
        boardID: "stale-board",
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: null,
        elements: [],
      },
    })
    const state = await readWhiteboardSession(project.path, "ses_render_report")

    expect(saved).toEqual({ saved: true })
    expect(stale).toEqual({ saved: false })
    expect(state.currentBoard?.boardID).toBe(created.boardID)
    expect(state.currentBoard?.updatedAt).toBe(created.state.currentBoard?.updatedAt)
    if (!state.currentBoard) throw new Error("Expected a current board")
    expect("renderReport" in state.currentBoard).toBeFalse()
  })

  test("read context returns compact layout digest from render reports", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_context",
      elements: JSON.stringify([
        { type: "rectangle", id: "box", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "box-text", containerId: "box", x: 10, y: 20, text: "Overflowing" },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_context",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 230, height: 60 },
        elements: [
          {
            id: "box",
            type: "rectangle",
            version: 1,
            versionNonce: 11,
            bounds: { x: 0, y: 0, width: 120, height: 60 },
          },
          {
            id: "box-text",
            type: "text",
            version: 1,
            versionNonce: 12,
            containerId: "box",
            text: "Overflowing",
            bounds: { x: 10, y: 20, width: 180, height: 24 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_render_layout_context" }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: Array<{ code: string; id?: string; containerId?: string }>
      }
      renderReport?: unknown
    }

    expect(output.renderReport).toBeUndefined()
    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "box-text",
      containerId: "box",
    })
  })

  test("render layout digest does not flag labels that are wide but still inside the container", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_no_false_overflow",
      elements: JSON.stringify([
        { type: "rectangle", id: "box", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "box-text", containerId: "box", x: 8, y: 20, text: "Fits" },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_no_false_overflow",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 120, height: 60 },
        elements: [
          {
            id: "box",
            type: "rectangle",
            version: 1,
            versionNonce: 11,
            bounds: { x: 0, y: 0, width: 120, height: 60 },
          },
          {
            id: "box-text",
            type: "text",
            version: 1,
            versionNonce: 12,
            containerId: "box",
            text: "Fits",
            bounds: { x: 8, y: 20, width: 110, height: 24 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({
        directory: project.path,
        sessionID: "ses_render_layout_no_false_overflow",
      }),
    )
    const output = JSON.parse(result.output) as { layout?: { status: string; issues?: unknown[] } }

    expect(output.layout?.status).toBe("ok")
    expect(output.layout?.issues).toBeUndefined()
  })

  test("render layout digest moves a bound label with its container", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_bound_label",
      elements: JSON.stringify([
        { type: "rectangle", id: "box", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "box-text", containerId: "box", x: 10, y: 20, text: "Label" },
        { type: "rectangle", id: "note", x: 30, y: 10, width: 120, height: 60 },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_bound_label",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 150, height: 70 },
        elements: [
          { id: "box", type: "rectangle", bounds: { x: 0, y: 0, width: 120, height: 60 } },
          {
            id: "box-text",
            type: "text",
            containerId: "box",
            text: "Label",
            bounds: { x: 10, y: 20, width: 60, height: 20 },
          },
          { id: "note", type: "rectangle", bounds: { x: 30, y: 10, width: 120, height: 60 } },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_render_layout_bound_label" }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        issues?: Array<{
          code: string
          a?: string
          suggested?: { ids?: string }
        }>
      }
    }
    const issue = output.layout?.issues?.find(
      (candidate) => candidate.code === "overlap" && candidate.a === "box-text",
    )

    expect(issue?.suggested?.ids).toBe("box")
  })

  test("rebases concurrent continuation writes against the latest locked board", async () => {
    await using project = await tmpdir()
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_concurrent_agent_writes",
      elements: JSON.stringify([
        { type: "rectangle", id: "base", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    await Promise.all([
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_concurrent_agent_writes",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "current" },
          { type: "text", id: "first", x: 0, y: 90, text: "First" },
        ]),
      }),
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_concurrent_agent_writes",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "current" },
          { type: "text", id: "second", x: 0, y: 130, text: "Second" },
        ]),
      }),
    ])

    const state = await readWhiteboardSession(project.path, "ses_concurrent_agent_writes")
    const latestIDs = state.currentBoard?.elements.map((element) => element.id)
    expect(new Set(latestIDs)).toEqual(new Set(["base", "first", "second"]))
  })

  test("allows continuation appends after learner edits without rereading context", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_append_after_learner_edit",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_append_after_learner_edit",
      edit: {
        baseBoardID: created.boardID,
        elements: [{ type: "rectangle", id: "node", x: 80, y: 0, width: 120, height: 60 }],
      },
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_append_after_learner_edit",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "text", id: "agent-note", x: 0, y: 100, text: "Added after edit" },
      ]),
    })

    expect(result.state.currentBoard?.elements.map((element) => element.id)).toEqual([
      "node",
      "agent-note",
    ])
    expect(result.state.currentBoard?.elements[0]?.x).toBe(80)
  })

  test("rejects continuation writes that touch learner-changed ids", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_touched_id",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_stale_touched_id",
      edit: {
        baseBoardID: created.boardID,
        elements: [{ type: "rectangle", id: "node", x: 80, y: 0, width: 120, height: 60 }],
      },
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_stale_touched_id",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "current" },
          { type: "translate", ids: "node", dx: 20, dy: 0 },
        ]),
      }),
    ).rejects.toBeInstanceOf(WhiteboardStaleWriteError)
  })

  test("allows continuation when render bounds become available after anchors were recorded", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_bounds_became_available",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_bounds_became_available",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 120, height: 60 },
        elements: [
          {
            id: "node",
            type: "rectangle",
            version: 1,
            versionNonce: 11,
            bounds: { x: 0, y: 0, width: 120, height: 60 },
          },
        ],
      },
    })

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_bounds_became_available",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "translate", ids: "node", dx: 20, dy: 0 },
      ]),
    })

    expect(result.state.currentBoard?.elements).toMatchObject([{ id: "node", x: 20 }])
  })

  test("rejects new arrows bound to learner-deleted ids", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_stale_arrow_binding",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_stale_arrow_binding",
      edit: {
        baseBoardID: created.boardID,
        elements: [{ type: "rectangle", id: "survivor", x: 180, y: 0, width: 120, height: 60 }],
      },
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_stale_arrow_binding",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "current" },
          {
            type: "arrow",
            id: "arrow",
            x: 120,
            y: 30,
            width: 80,
            height: 0,
            startBinding: { elementId: "node" },
          },
        ]),
      }),
    ).rejects.toBeInstanceOf(WhiteboardStaleWriteError)
  })

  test("allows touching unchanged ids after unrelated learner edits and records agent anchors", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_unrelated_stale_safety",
      elements: JSON.stringify([
        { type: "rectangle", id: "node_a", x: 0, y: 0, width: 120, height: 60 },
        { type: "rectangle", id: "node_b", x: 180, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_unrelated_stale_safety",
      edit: {
        baseBoardID: created.boardID,
        elements: [
          { type: "rectangle", id: "node_a", x: 0, y: 0, width: 120, height: 60 },
          { type: "rectangle", id: "node_b", x: 260, y: 0, width: 120, height: 60 },
        ],
      },
    })

    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_unrelated_stale_safety",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "translate", ids: "node_a", dx: 20, dy: 0 },
      ]),
    })
    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_unrelated_stale_safety",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "translate", ids: "node_a", dx: 20, dy: 0 },
      ]),
    })

    expect(result.state.currentBoard?.elements).toMatchObject([
      { id: "node_a", x: 40 },
      { id: "node_b", x: 260 },
    ])
  })

  test("refreshes touched-id anchors after whiteboard_read_context", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_read_refreshes_anchors",
      elements: JSON.stringify([
        { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_read_refreshes_anchors",
      edit: {
        baseBoardID: created.boardID,
        elements: [{ type: "rectangle", id: "node", x: 80, y: 0, width: 120, height: 60 }],
      },
    })
    await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_read_refreshes_anchors" }),
    )

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_read_refreshes_anchors",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "translate", ids: "node", dx: 20, dy: 0 },
      ]),
    })

    expect(result.state.currentBoard?.elements[0]?.x).toBe(100)
  })

  test("returns actionable drawing-program parse errors", () => {
    expect(() => parseDrawingProgram('{"type":"rectangle"}')).toThrow(
      "Whiteboard elements must decode to a JSON array.",
    )
    expect(() => parseDrawingProgram("[")).toThrow(
      "Whiteboard elements must be a valid compact JSON array string.",
    )
    expect(() => parseDrawingProgram(" ".repeat(MAX_WHITEBOARD_PAYLOAD_BYTES + 1))).toThrow(
      `Whiteboard drawing program exceeds ${MAX_WHITEBOARD_PAYLOAD_BYTES} bytes.`,
    )
  })

  test("skips invalid drawn elements instead of failing the whole drawing", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_element",
      elements: JSON.stringify([
        { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
        { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
        { type: "rectangle", id: "kept", x: 20, y: 20, width: 120, height: 80 },
        { type: "line", id: "dimensionless-line", x: 40, y: 120 },
        { type: "rectangle", id: "missing-y", x: 20, width: 120, height: 80 },
        { type: "rectangle", id: "kept", x: 200, y: 20, width: 120, height: 80 },
        { id: "missing-type", x: 0, y: 0, width: 120, height: 80 },
      ]),
    })

    const state = await readWhiteboardSession(project.path, "ses_invalid_element")
    expect(state.currentBoard?.elements).toEqual([
      { type: "rectangle", id: "kept", x: 20, y: 20, width: 120, height: 80 },
      { type: "line", id: "dimensionless-line", x: 40, y: 120 },
    ])
    expect(result.warnings.length).toBe(4)
    expect(result.warnings.join("\n")).toContain("unsupported type 'image'")
    expect(result.warnings.join("\n")).toContain("duplicate live whiteboard element id 'kept'")
  })

  test("does not save a blank board when every drawable element is invalid", async () => {
    await using project = await tmpdir()

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_blank_invalid",
        elements: JSON.stringify([
          { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
          { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
          { id: "missing-type", x: 0, y: 0, width: 120, height: 80 },
        ]),
      }),
    ).rejects.toThrow(
      "Whiteboard program did not contain any valid drawable elements, so no board was saved.",
    )

    const state = await readWhiteboardSession(project.path, "ses_blank_invalid")
    expect(state.currentBoard).toBeNull()
  })

  test("does not save a no-op continuation", async () => {
    await using project = await tmpdir()
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_noop_invalid",
      elements: JSON.stringify([
        { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 80 },
      ]),
    })

    const before = await readWhiteboardSession(project.path, "ses_noop_invalid")
    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_noop_invalid",
        elements: JSON.stringify([
          { type: "restoreCheckpoint", id: "current" },
          { type: "image", id: "img", x: 0, y: 0, width: 120, height: 80 },
        ]),
      }),
    ).rejects.toThrow("Whiteboard program did not make any valid changes, so no board was saved.")

    const after = await readWhiteboardSession(project.path, "ses_noop_invalid")
    expect(after.currentBoard?.boardID).toBe(before.currentBoard?.boardID)
  })

  test("normalizes malformed labels instead of failing the whole drawing", async () => {
    await using project = await tmpdir()

    const result = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_label",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "node",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { value: "Node" },
        },
        {
          type: "ellipse",
          id: "empty-label",
          x: 160,
          y: 0,
          width: 120,
          height: 80,
          label: { value: "" },
        },
      ]),
    })

    expect(result.state.currentBoard?.elements).toEqual([
      {
        type: "rectangle",
        id: "node",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        label: { value: "Node", text: "Node" },
      },
      {
        type: "ellipse",
        id: "empty-label",
        x: 160,
        y: 0,
        width: 120,
        height: 80,
      },
    ])
  })

  test("read context includes visible learner text and latest edit summary", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_read_context",
      elements: JSON.stringify([
        {
          type: "rectangle",
          id: "solid",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          label: { text: "Solid" },
        },
      ]),
    })

    await saveWhiteboardLearnerEdit({
      directory: project.path,
      sessionID: "ses_read_context",
      edit: {
        baseBoardID: created.boardID,
        elements: [
          {
            type: "rectangle",
            id: "solid",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            label: { text: "Solid" },
          },
          {
            type: "text",
            id: "learner-note",
            x: 160,
            y: 0,
            text: "Particles are packed tightly",
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_read_context" }),
    )
    const output = JSON.parse(result.output) as {
      continuationHandle: string
      currentBoardOrigin: string
      elementCount: number
      visibleText: Array<{ id: string; type: string; text: string }>
      latestLearnerEditSummary?: { added?: string[] }
    }

    expect(output.continuationHandle).toBe("current")
    expect(output.currentBoardOrigin).toBe("learner")
    expect(output.elementCount).toBe(2)
    expect(output.visibleText).toEqual([
      { id: "solid", type: "rectangle", text: "Solid" },
      { id: "learner-note", type: "text", text: "Particles are packed tightly" },
    ])
    expect(output.latestLearnerEditSummary?.added?.join("\n")).toContain(
      'text "Particles are packed tightly" (learner-note)',
    )
  })
})
