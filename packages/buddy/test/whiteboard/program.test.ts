import { describe, expect, test } from "bun:test"
import { setTimeout as sleep } from "node:timers/promises"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import {
  applyWhiteboardDrawingProgram as applyWhiteboardDrawingProgramForObject,
  parseDrawingProgram,
} from "../../src/learning/features/whiteboard/service/program"
import {
  createWhiteboardObject,
  readAndRecordWhiteboardBoardContext as readAndRecordWhiteboardObjectContext,
  readWhiteboardObject,
  readWhiteboardBoardContext as readWhiteboardObjectContext,
  saveWhiteboardLearnerEdit as saveWhiteboardObjectLearnerEdit,
  saveWhiteboardRenderReport as saveWhiteboardObjectRenderReport,
} from "../../src/learning/features/whiteboard/service/store"
import { BUDDY_OBJECT_KINDS, listObjects } from "../../src/objects"
import {
  WhiteboardPayloadTooLargeError,
  WhiteboardStaleLearnerEditError,
  WhiteboardStaleWriteError,
} from "../../src/learning/features/whiteboard/errors"
import { MAX_WHITEBOARD_PAYLOAD_BYTES } from "../../src/learning/features/whiteboard/service/payload"
import {
  createWhiteboardViewTool as createWhiteboardViewToolForObject,
  readWhiteboardContextTool as readWhiteboardContextToolForObject,
} from "../../src/learning/features/whiteboard/tools/tools"
import type { WhiteboardRenderReport } from "../../src/learning/features/whiteboard/service/types"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { tmpdir } from "../helpers/tmpdir"

type LayoutMetadataForTest = {
  layout?: {
    status: string
    issues?: Array<{
      code: string
      id?: string
      containerId?: string
      overflowDirection?: string
      overflowPx?: { x?: number; y?: number }
    }>
    issuesTruncated?: boolean
  }
}

type OverflowFixture = {
  programElements: unknown[]
  reportElements: WhiteboardRenderReport["elements"]
}

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

const testWhiteboardObjectBySession = new Map<
  string,
  ReturnType<typeof createWhiteboardObject>
>()

function testWhiteboardSessionKey(directory: string, sessionID: string): string {
  return JSON.stringify([directory, sessionID])
}

function ensureWhiteboardObjectForSession(input: { directory: string; sessionID: string }) {
  const key = testWhiteboardSessionKey(input.directory, input.sessionID)
  const existing = testWhiteboardObjectBySession.get(key)
  if (existing) return existing
  const created = createWhiteboardObject({ directory: input.directory })
  testWhiteboardObjectBySession.set(key, created)
  return created
}

function existingWhiteboardObjectForSession(directory: string, sessionID: string) {
  return testWhiteboardObjectBySession.get(testWhiteboardSessionKey(directory, sessionID))
}

async function applyWhiteboardDrawingProgram(
  input: Omit<Parameters<typeof applyWhiteboardDrawingProgramForObject>[0], "objectID"> & {
    sessionID: string
  },
) {
  const { sessionID, ...program } = input
  const object = await ensureWhiteboardObjectForSession({ directory: input.directory, sessionID })
  return applyWhiteboardDrawingProgramForObject({ ...program, objectID: object.objectID })
}

async function readWhiteboardSession(directory: string, sessionID: string) {
  const object = await existingWhiteboardObjectForSession(directory, sessionID)
  return object
    ? readWhiteboardObject(directory, object.objectID)
    : { objectID: null, currentBoard: null }
}

async function readWhiteboardBoardContext(directory: string, sessionID: string) {
  const object = await existingWhiteboardObjectForSession(directory, sessionID)
  return object
    ? readWhiteboardObjectContext(directory, object.objectID)
    : { currentBoard: null }
}

async function readAndRecordWhiteboardBoardContext(directory: string, sessionID: string) {
  const object = await existingWhiteboardObjectForSession(directory, sessionID)
  return object
    ? readAndRecordWhiteboardObjectContext(directory, object.objectID)
    : { currentBoard: null }
}

async function saveWhiteboardRenderReport(
  input: Omit<Parameters<typeof saveWhiteboardObjectRenderReport>[0], "objectID"> & {
    sessionID: string
  },
) {
  const { sessionID, ...report } = input
  const object = await ensureWhiteboardObjectForSession({ directory: input.directory, sessionID })
  return saveWhiteboardObjectRenderReport({ ...report, objectID: object.objectID })
}

async function saveWhiteboardLearnerEdit(
  input: Omit<Parameters<typeof saveWhiteboardObjectLearnerEdit>[0], "objectID"> & {
    sessionID: string
  },
) {
  const { sessionID, ...edit } = input
  const object = await ensureWhiteboardObjectForSession({ directory: input.directory, sessionID })
  return saveWhiteboardObjectLearnerEdit({ ...edit, objectID: object.objectID })
}

type TestCreateWhiteboardViewInput = {
  objectID?: string | null
  boardAction: "continue_current_board" | "destructively_replace_current_board"
  elements: string
}

const createWhiteboardViewTool = {
  async run(input: TestCreateWhiteboardViewInput, ctx: BuddyToolContext) {
    const object = input.objectID
      ? await readWhiteboardObject(ctx.directory, input.objectID)
      : await ensureWhiteboardObjectForSession({
          directory: ctx.directory,
          sessionID: String(ctx.sessionID),
        })
    return createWhiteboardViewToolForObject.run({ ...input, objectID: object.objectID }, ctx)
  },
}

const readWhiteboardContextTool = {
  async run(_input: Record<string, never>, ctx: BuddyToolContext) {
    const object = await ensureWhiteboardObjectForSession({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
    })
    return readWhiteboardContextToolForObject.run({ objectID: object.objectID }, ctx)
  },
}

async function waitForWhiteboardBoardID(input: {
  directory: string
  sessionID: string
}): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const context = await readWhiteboardBoardContext(input.directory, input.sessionID)
    if (context.currentBoard) return context.currentBoard.boardID
    await sleep(25)
  }
  throw new Error("Expected whiteboard board to be saved")
}

async function waitForNextWhiteboardBoardID(input: {
  directory: string
  sessionID: string
  previousBoardID: string
}): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const context = await readWhiteboardBoardContext(input.directory, input.sessionID)
    const boardID = context.currentBoard?.boardID
    if (boardID && boardID !== input.previousBoardID) return boardID
    await sleep(25)
  }
  throw new Error("Expected next whiteboard board to be saved")
}

function buildNaturalWidthOverflowFixture(input: {
  cardID: string
  textID: string
  y: number
}): OverflowFixture {
  const text =
    "When you touch a ringing bell, what do you feel and how does the vibration move through matter?"
  return {
    programElements: [
      {
        type: "rectangle",
        id: input.cardID,
        x: 0,
        y: input.y,
        width: 280,
        height: 120,
      },
      {
        type: "text",
        id: input.textID,
        x: 20,
        y: input.y + 25,
        width: 230,
        height: 24,
        text,
      },
    ],
    reportElements: [
      {
        id: input.cardID,
        type: "rectangle",
        bounds: { x: 0, y: input.y, width: 280, height: 120 },
      },
      {
        id: input.textID,
        type: "text",
        text,
        bounds: { x: 20, y: input.y + 25, width: 740, height: 24 },
      },
    ],
  }
}

describe("whiteboard drawing program", () => {
  test("creates, continues, and replaces the current board with requested write mode", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      writeMode: "continue",
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

    expect(created.continuationHandle).toBe("current")

    const continued = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      writeMode: "continue",
      elements: JSON.stringify([
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

    const defaultContinued = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      writeMode: "continue",
      elements: JSON.stringify([
        { type: "text", id: "implicit-append", x: 20, y: 120, text: "More board work" },
      ]),
    })

    expect(defaultContinued.state.currentBoard?.elements.map((element) => element.id)).toEqual([
      "solid",
      "melting-with-heat",
      "implicit-append",
    ])

    const replaced = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_whiteboard",
      writeMode: "replace",
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

  test("rejects conflicting requested write modes and previous board-action controls", async () => {
    await using project = await tmpdir()
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_invalid_replacement_control",
      elements: JSON.stringify([
        { type: "rectangle", id: "base", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_invalid_replacement_control",
        writeMode: "replace",
        elements: JSON.stringify([
          { type: "text", id: "before-replace", x: 0, y: 80, text: "No" },
          { type: "restoreCheckpoint", id: "current" },
        ]),
      }),
    ).rejects.toThrow("boardAction conflicts with restoreCheckpoint/replaceCurrentBoard")

    await expect(
      applyWhiteboardDrawingProgram({
        directory: project.path,
        sessionID: "ses_invalid_replacement_control",
        writeMode: "continue",
        elements: JSON.stringify([
          { type: "replaceCurrentBoard" },
          { type: "text", id: "ambiguous", x: 0, y: 80, text: "No" },
        ]),
      }),
    ).rejects.toThrow("boardAction conflicts with restoreCheckpoint/replaceCurrentBoard")

    const state = await readWhiteboardSession(project.path, "ses_invalid_replacement_control")
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

  test("returns compact measured layout feedback from create-view", async () => {
    await using project = await tmpdir()
    const sessionID = "ses_layout_warning_tool"

    const toolResult = createWhiteboardViewTool.run(
      {
        boardAction: "continue_current_board",
        elements: JSON.stringify([
          { type: "rectangle", id: "box", x: 0, y: 0, width: 120, height: 60 },
          { type: "text", id: "box-text", containerId: "box", x: 10, y: 20, text: "Overflow" },
        ]),
      },
      createContext({ directory: project.path, sessionID }),
    )
    const reportResult = (async () => {
      const boardID = await waitForWhiteboardBoardID({
        directory: project.path,
        sessionID,
      })
      await saveWhiteboardRenderReport({
        directory: project.path,
        sessionID,
        report: {
          boardID,
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
              text: "Overflow",
              bounds: { x: 10, y: 20, width: 180, height: 24 },
            },
          ],
        },
      })
    })()

    const [result] = await Promise.all([toolResult, reportResult])

    expect(result.output).not.toContain("WHITEBOARD LAYOUT REPAIR SUGGESTED BEFORE REPLYING.")
    expect(result.output).toContain("Measured whiteboard layout issues from rendered bounds:")
    expect(result.output).toContain('"code":"text_overflow"')
    expect(result.metadata?.layoutWarnings).toBeUndefined()
    expect(result.metadata?.layout).toMatchObject({
      status: "issues",
      issues: [
        {
          code: "text_overflow",
          id: "box-text",
          containerId: "box",
          overflowDirection: "horizontal",
          overflowPx: { x: 70 },
        },
      ],
    })
  })

  test("create-view prioritizes current write layout feedback when old issues fill the cap", async () => {
    await using project = await tmpdir()
    const sessionID = "ses_layout_priority_current_write"
    const oldFixtures = Array.from({ length: 10 }, (_, index) =>
      buildNaturalWidthOverflowFixture({
        cardID: `old-card-${index}`,
        textID: `old-text-${index}`,
        y: index * 180,
      }),
    )

    const initialBoard = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID,
      writeMode: "continue",
      elements: JSON.stringify(oldFixtures.flatMap((fixture) => fixture.programElements)),
    })

    const newFixture = buildNaturalWidthOverflowFixture({
      cardID: "r3-card",
      textID: "r3-body",
      y: 1900,
    })
    const toolResult = createWhiteboardViewTool.run(
      {
        boardAction: "continue_current_board",
        elements: JSON.stringify(newFixture.programElements),
      },
      createContext({ directory: project.path, sessionID }),
    )
    const reportResult = (async () => {
      const boardID = await waitForNextWhiteboardBoardID({
        directory: project.path,
        sessionID,
        previousBoardID: initialBoard.boardID,
      })
      await saveWhiteboardRenderReport({
        directory: project.path,
        sessionID,
        report: {
          boardID,
          viewport: { x: 0, y: 0, width: 1000, height: 800 },
          canvas: { width: 1000, height: 800, zoom: 1 },
          contentBounds: { x: 0, y: 0, width: 760, height: 2020 },
          elements: [
            ...oldFixtures.flatMap((fixture) => fixture.reportElements),
            ...newFixture.reportElements,
          ],
        },
      })
    })()

    const [result] = await Promise.all([toolResult, reportResult])
    const metadata = result.metadata as LayoutMetadataForTest

    expect(result.output).toContain('"issuesTruncated":true')
    expect(result.output).toContain('"id":"r3-body"')
    expect(metadata.layout?.status).toBe("issues")
    expect(metadata.layout?.issuesTruncated).toBe(true)
    expect(metadata.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "r3-body",
      containerId: "r3-card",
      overflowDirection: "horizontal",
      overflowPx: { x: 480 },
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
        {
          type: "text",
          id: "box-text",
          containerId: "box",
          x: 10,
          y: 20,
          width: 120,
          height: 24,
          text: "Overflowing",
        },
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
        issues?: Array<{
          code: string
          id?: string
          containerId?: string
          overflowDirection?: string
        }>
      }
      elements?: Array<{
        id: string
        renderBounds?: {
          x: number
          y: number
          width: number
          height: number
        }
      }>
      renderReport?: unknown
    }

    expect(output.renderReport).toBeUndefined()
    expect(output.elements?.find((element) => element.id === "box-text")).toMatchObject({
      renderBounds: { x: 10, y: 20, width: 180, height: 24 },
    })
    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "box-text",
      containerId: "box",
      overflowDirection: "horizontal",
    })
  })

  test("read context does not create an empty whiteboard object", async () => {
    await using project = await tmpdir()

    const context = await readAndRecordWhiteboardBoardContext(
      project.path,
      "ses_read_context_without_board",
    )
    const session = await readWhiteboardSession(project.path, "ses_read_context_without_board")
    const listed = await listObjects({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
    })

    expect(context.currentBoard).toBeNull()
    expect(session.objectID).toBeNull()
    expect(listed.objects).toEqual([])
  })

  test("render layout digest reports text that is too small at the current zoom", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_text_too_small",
      elements: JSON.stringify([
        {
          type: "text",
          id: "small-note",
          x: 40,
          y: 40,
          text: "Pathshalas, William Adam",
          fontSize: 13,
        },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_text_too_small",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 1143, height: 857 },
        canvas: { width: 800, height: 600, zoom: 0.7 },
        contentBounds: { x: 40, y: 40, width: 155, height: 16.25 },
        elements: [
          {
            id: "small-note",
            type: "text",
            text: "Pathshalas, William Adam",
            fontSize: 13,
            bounds: { x: 40, y: 40, width: 155, height: 16.25 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({
        directory: project.path,
        sessionID: "ses_render_layout_text_too_small",
      }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: Array<{
          code: string
          id?: string
          fontSize?: number
          renderedFontPx?: number
          zoom?: number
        }>
      }
    }

    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_too_small",
      id: "small-note",
      fontSize: 13,
      renderedFontPx: 9.1,
      zoom: 0.7,
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

  test("render layout digest ignores text contained by earlier background panels", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_background_panels",
      elements: JSON.stringify([
        { type: "rectangle", id: "bg-left", x: 40, y: 40, width: 320, height: 820 },
        { type: "rectangle", id: "bg-center", x: 390, y: 40, width: 520, height: 820 },
        { type: "text", id: "title-left", x: 80, y: 60, text: "ANCHOR ZONE" },
        { type: "rectangle", id: "rule-box", x: 70, y: 230, width: 260, height: 160 },
        { type: "text", id: "rule-title", x: 85, y: 242, text: "RULES" },
        { type: "text", id: "rule1", x: 85, y: 270, text: "Unit digits: 0,1,4,5,6,9" },
        { type: "text", id: "center-label", x: 420, y: 100, text: "Visual Proof" },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_background_panels",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 1200, height: 900 },
        canvas: { width: 1053, height: 1004, zoom: 0.7 },
        contentBounds: { x: 40, y: 40, width: 870, height: 820 },
        elements: [
          {
            id: "bg-left",
            type: "rectangle",
            bounds: { x: 40, y: 40, width: 320, height: 820 },
          },
          {
            id: "bg-center",
            type: "rectangle",
            bounds: { x: 390, y: 40, width: 520, height: 820 },
          },
          {
            id: "title-left",
            type: "text",
            text: "ANCHOR ZONE",
            bounds: { x: 80, y: 60, width: 140, height: 28 },
          },
          {
            id: "rule-box",
            type: "rectangle",
            bounds: { x: 70, y: 230, width: 260, height: 160 },
          },
          {
            id: "rule-title",
            type: "text",
            text: "RULES",
            bounds: { x: 85, y: 242, width: 60, height: 24 },
          },
          {
            id: "rule1",
            type: "text",
            text: "Unit digits: 0,1,4,5,6,9",
            bounds: { x: 85, y: 270, width: 220, height: 22 },
          },
          {
            id: "center-label",
            type: "text",
            text: "Visual Proof",
            bounds: { x: 420, y: 100, width: 120, height: 24 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_render_layout_background_panels" }),
    )
    const output = JSON.parse(result.output) as { layout?: { status: string; issues?: unknown[] } }

    expect(output.layout?.status).toBe("ok")
    expect(output.layout?.issues).toBeUndefined()
  })

  test("render layout digest reports implicit container text overflow instead of overlap", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_implicit_container_overflow",
      elements: JSON.stringify([
        { type: "rectangle", id: "rules-box", x: 40, y: 40, width: 220, height: 80 },
        { type: "text", id: "rules-line", x: 55, y: 96, text: "n^a x m^a = (nm)^a" },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_implicit_container_overflow",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 40, y: 40, width: 220, height: 104 },
        elements: [
          {
            id: "rules-box",
            type: "rectangle",
            bounds: { x: 40, y: 40, width: 220, height: 80 },
          },
          {
            id: "rules-line",
            type: "text",
            text: "n^a x m^a = (nm)^a",
            bounds: { x: 55, y: 96, width: 180, height: 48 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({
        directory: project.path,
        sessionID: "ses_render_layout_implicit_container_overflow",
      }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: {
          code: string
          id?: string
          containerId?: string
          a?: string
          b?: string
          overflowDirection?: string
        }[]
      }
    }

    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "rules-line",
      containerId: "rules-box",
      overflowDirection: "vertical",
    })
    expect(output.layout?.issues?.[0]?.code).not.toBe("sibling_collision")
  })

  test("render layout digest reports horizontal text overflow and sibling collision separately", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_horizontal_overflow_cascade",
      elements: JSON.stringify([
        { type: "rectangle", id: "p1", x: 60, y: 1140, width: 280, height: 380 },
        {
          type: "text",
          id: "p1b",
          x: 80,
          y: 1185,
          text: "When you touch a ringing bell, what do you feel?",
        },
        { type: "rectangle", id: "p2", x: 360, y: 1140, width: 280, height: 380 },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_horizontal_overflow_cascade",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 1600, height: 1200 },
        canvas: { width: 1200, height: 900, zoom: 1 },
        contentBounds: { x: 60, y: 1140, width: 580, height: 380 },
        elements: [
          { id: "p1", type: "rectangle", bounds: { x: 60, y: 1140, width: 280, height: 380 } },
          {
            id: "p1b",
            type: "text",
            text: "When you touch a ringing bell, what do you feel?",
            bounds: { x: 80, y: 1185, width: 352, height: 300 },
          },
          { id: "p2", type: "rectangle", bounds: { x: 360, y: 1140, width: 280, height: 380 } },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({
        directory: project.path,
        sessionID: "ses_render_layout_horizontal_overflow_cascade",
      }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: Array<{
          code: string
          id?: string
          containerId?: string
          overflowDirection?: string
          overflowPx?: { x?: number; y?: number }
          a?: string
          b?: string
          separationAxis?: string
          overlapPx?: { x: number; y: number }
        }>
      }
    }

    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "p1b",
      containerId: "p1",
      overflowDirection: "horizontal",
      overflowPx: { x: 92 },
    })
    expect(output.layout?.issues?.[1]).toMatchObject({
      code: "sibling_collision",
      a: "p1b",
      b: "p2",
      separationAxis: "horizontal",
      overlapPx: { x: 72, y: 300 },
    })
  })

  test("render layout digest reports overflow when a natural-width line starts inside a card", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_text_anchor_overflow",
      elements: JSON.stringify([
        { type: "rectangle", id: "test-card-1", x: 0, y: 100, width: 280, height: 150 },
        {
          type: "text",
          id: "test-card-1-body",
          x: 20,
          y: 125,
          width: 230,
          height: 24,
          text: "When you touch a ringing bell, what do you feel and how do you know the vibration is moving through matter?",
        },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_text_anchor_overflow",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 1000, height: 600 },
        canvas: { width: 1000, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 100, width: 760, height: 150 },
        elements: [
          {
            id: "test-card-1",
            type: "rectangle",
            bounds: { x: 0, y: 100, width: 280, height: 150 },
          },
          {
            id: "test-card-1-body",
            type: "text",
            text: "When you touch a ringing bell, what do you feel and how do you know the vibration is moving through matter?",
            bounds: { x: 20, y: 125, width: 740, height: 24 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({
        directory: project.path,
        sessionID: "ses_render_layout_text_anchor_overflow",
      }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: Array<{
          code: string
          id?: string
          containerId?: string
          overflowDirection?: string
          overflowPx?: { x?: number; y?: number }
        }>
      }
    }

    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_overflow",
      id: "test-card-1-body",
      containerId: "test-card-1",
      overflowDirection: "horizontal",
      overflowPx: { x: 480 },
    })
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
          moveTogetherId?: string
        }>
      }
    }
    const issue = output.layout?.issues?.find(
      (candidate) => candidate.code === "sibling_collision" && candidate.a === "box-text",
    )

    expect(issue?.moveTogetherId).toBe("box")
  })

  test("render layout digest reports later opaque shapes covering text", async () => {
    await using project = await tmpdir()
    const created = await applyWhiteboardDrawingProgram({
      directory: project.path,
      sessionID: "ses_render_layout_text_occlusion",
      elements: JSON.stringify([
        { type: "text", id: "covered-text", x: 20, y: 20, text: "Covered" },
        {
          type: "rectangle",
          id: "cover",
          x: 0,
          y: 0,
          width: 160,
          height: 80,
          backgroundColor: "#663333",
          fillStyle: "solid",
        },
      ]),
    })

    await saveWhiteboardRenderReport({
      directory: project.path,
      sessionID: "ses_render_layout_text_occlusion",
      report: {
        boardID: created.boardID,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        canvas: { width: 800, height: 600, zoom: 1 },
        contentBounds: { x: 0, y: 0, width: 160, height: 80 },
        elements: [
          {
            id: "covered-text",
            type: "text",
            text: "Covered",
            bounds: { x: 20, y: 20, width: 90, height: 24 },
          },
          {
            id: "cover",
            type: "rectangle",
            backgroundColor: "#663333",
            fillStyle: "solid",
            opacity: 100,
            bounds: { x: 0, y: 0, width: 160, height: 80 },
          },
        ],
      },
    })

    const result = await readWhiteboardContextTool.run(
      {},
      createContext({ directory: project.path, sessionID: "ses_render_layout_text_occlusion" }),
    )
    const output = JSON.parse(result.output) as {
      layout?: {
        status: string
        issues?: Array<{
          code: string
          textId?: string
          occluderId?: string
          overlapPx?: { x: number; y: number }
          occluderOpacity?: number
        }>
      }
    }

    expect(output.layout?.status).toBe("issues")
    expect(output.layout?.issues?.[0]).toMatchObject({
      code: "text_occluded",
      textId: "covered-text",
      occluderId: "cover",
      overlapPx: { x: 90, y: 24 },
      occluderOpacity: 100,
    })
    expect(output.layout?.issues?.some((issue) => issue.code === "sibling_collision")).toBeFalse()
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

  test("serializes concurrent first whiteboard object creation per session", async () => {
    await using project = await tmpdir()
    const manifests = await Promise.all(
      Array.from({ length: 8 }, () =>
        ensureWhiteboardObjectForSession({
          directory: project.path,
          sessionID: "ses_concurrent_first_object",
        }),
      ),
    )
    const listed = await listObjects({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
    })

    expect(new Set(manifests.map((manifest) => manifest.objectID)).size).toBe(1)
    expect(listed.objects).toHaveLength(1)
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
