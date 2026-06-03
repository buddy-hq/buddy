import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { monotonicFactory } from "ulid"
import { WhiteboardStaleLearnerEditError } from "../errors"
import { WhiteboardPath } from "./path"
import { assertWhiteboardPayloadWithinLimit } from "./payload"
import { buildWhiteboardModelContext } from "./model-context"
import {
  WhiteboardBoardSchema,
  WhiteboardRenderReportSaveResponseSchema,
  WhiteboardRenderReportSchema,
  WhiteboardSessionReadSchema,
  WhiteboardSessionStateSchema,
  parsePersistableWhiteboardElement,
  sanitizeWhiteboardElements,
  type WhiteboardBoard,
  type WhiteboardBoardOrigin,
  type WhiteboardElement,
  type WhiteboardLearnerEditRequest,
  type WhiteboardRenderReport,
  type WhiteboardRenderReportSaveResponse,
  type WhiteboardSessionBoard,
  type WhiteboardSessionRead,
  type WhiteboardSessionState,
  type WhiteboardViewport,
} from "./types"

const STATE_VERSION = 2
const WHITEBOARD_CONTINUATION_HANDLE = "current"
const RENDER_REPORT_WAIT_TIMEOUT_MS = 4_000
const RENDER_REPORT_POLL_INTERVAL_MS = 100
const mutationTails = new Map<string, Promise<void>>()
const createWhiteboardID = monotonicFactory()

type WhiteboardBoardBuildBase = {
  boardID?: string
  elements: WhiteboardElement[]
  hasCurrentBoard: boolean
  currentBoard?: WhiteboardBoard
  modelContext?: WhiteboardSessionState["modelContext"]
  viewport?: WhiteboardViewport
}

type WhiteboardBoardBuildResult = {
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}

type WhiteboardCurrentWriteResult = {
  state: WhiteboardSessionRead
  saved: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function writeAtomicJson(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
  )
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await fs.rename(temporaryPath, targetPath)
}

function emptyState(sessionID: string): WhiteboardSessionState {
  return WhiteboardSessionStateSchema.parse({
    version: STATE_VERSION,
    sessionID,
  })
}

async function readState(directory: string, sessionID: string): Promise<WhiteboardSessionState> {
  const filepath = WhiteboardPath.sessionFile(directory, sessionID)
  try {
    const parsed = JSON.parse(await fs.readFile(filepath, "utf8")) as unknown
    if (!isRecord(parsed) || parsed.version !== STATE_VERSION) {
      return emptyState(sessionID)
    }
    return WhiteboardSessionStateSchema.parse(parsed)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return emptyState(sessionID)
    }
    throw error
  }
}

async function mutateState<T>(
  directory: string,
  sessionID: string,
  mutate: (state: WhiteboardSessionState) => T | Promise<T>,
): Promise<T> {
  const filepath = WhiteboardPath.sessionFile(directory, sessionID)
  const previous = mutationTails.get(filepath) ?? Promise.resolve()
  let release: (() => void) | undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current)
  mutationTails.set(filepath, tail)
  await previous

  try {
    const state = await readState(directory, sessionID)
    const result = await mutate(state)
    await writeAtomicJson(filepath, state)
    return result
  } finally {
    release?.()
    if (mutationTails.get(filepath) === tail) {
      mutationTails.delete(filepath)
    }
  }
}

function sanitizeBoard(board: WhiteboardBoard): WhiteboardBoard {
  return WhiteboardBoardSchema.parse({
    ...board,
    elements: sanitizeWhiteboardElements(board.elements),
  })
}

function withoutRenderReport(board: WhiteboardBoard): WhiteboardSessionBoard {
  const { renderReport: _renderReport, ...sessionBoard } = board
  return sessionBoard
}

function toPreviousBoard(board: WhiteboardBoard): WhiteboardBoard {
  const { renderReport: _renderReport, ...previousBoard } = board
  return WhiteboardBoardSchema.parse(previousBoard)
}

function createBoard(input: {
  origin: WhiteboardBoardOrigin
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}): WhiteboardBoard {
  return WhiteboardBoardSchema.parse({
    boardID: createWhiteboardID(),
    origin: input.origin,
    updatedAt: new Date().toISOString(),
    elements: input.elements,
    ...(input.viewport ? { viewport: input.viewport } : {}),
  })
}

function writeCurrentBoard(
  state: WhiteboardSessionState,
  input: {
    origin: WhiteboardBoardOrigin
    elements: WhiteboardElement[]
    viewport?: WhiteboardViewport
  },
): WhiteboardBoard {
  if (state.currentBoard) {
    state.previousBoard = toPreviousBoard(sanitizeBoard(state.currentBoard))
  }
  const board = createBoard(input)
  state.currentBoard = board
  return board
}

function saveLearnerBoard(
  state: WhiteboardSessionState,
  input: {
    elements: WhiteboardElement[]
    viewport?: WhiteboardViewport
  },
): WhiteboardBoard {
  const currentBoard = state.currentBoard
  if (!currentBoard) {
    throw new WhiteboardStaleLearnerEditError()
  }
  state.previousBoard = toPreviousBoard(sanitizeBoard(currentBoard))
  const board = WhiteboardBoardSchema.parse({
    boardID: currentBoard.boardID,
    origin: "learner",
    updatedAt: new Date().toISOString(),
    elements: input.elements,
    ...(input.viewport
      ? { viewport: input.viewport }
      : currentBoard.viewport
        ? { viewport: currentBoard.viewport }
        : {}),
  })
  state.currentBoard = board
  return board
}

function toSessionRead(state: WhiteboardSessionState): WhiteboardSessionRead {
  return WhiteboardSessionReadSchema.parse({
    currentBoard: state.currentBoard
      ? withoutRenderReport(sanitizeBoard(state.currentBoard))
      : null,
  })
}

async function readWhiteboardSession(
  directory: string,
  sessionID: string,
): Promise<WhiteboardSessionRead> {
  return toSessionRead(await readState(directory, sessionID))
}

async function readWhiteboardBoardContext(
  directory: string,
  sessionID: string,
): Promise<{
  currentBoard: WhiteboardBoard | null
  previousBoard?: WhiteboardBoard
}> {
  const state = await readState(directory, sessionID)
  return {
    currentBoard: state.currentBoard ? sanitizeBoard(state.currentBoard) : null,
    ...(state.previousBoard ? { previousBoard: sanitizeBoard(state.previousBoard) } : {}),
  }
}

async function readAndRecordWhiteboardBoardContext(
  directory: string,
  sessionID: string,
): Promise<{
  currentBoard: WhiteboardBoard | null
  previousBoard?: WhiteboardBoard
}> {
  return mutateState(directory, sessionID, (state) => {
    const currentBoard = state.currentBoard ? sanitizeBoard(state.currentBoard) : undefined
    if (currentBoard) {
      state.modelContext = buildWhiteboardModelContext(currentBoard)
    }
    return {
      currentBoard: currentBoard ?? null,
      ...(state.previousBoard ? { previousBoard: sanitizeBoard(state.previousBoard) } : {}),
    }
  })
}

async function writeWhiteboardCurrentFromLatest(input: {
  directory: string
  sessionID: string
  origin: WhiteboardBoardOrigin
  buildBoard: (base: WhiteboardBoardBuildBase) => WhiteboardBoardBuildResult
  validateBase?: (base: WhiteboardBoardBuildBase) => void
  recordModelContext?: boolean
  shouldSave?: (input: {
    base: WhiteboardBoardBuildBase
    next: WhiteboardBoardBuildResult
  }) => boolean
}): Promise<WhiteboardCurrentWriteResult> {
  return mutateState(input.directory, input.sessionID, (state) => {
    const currentBoard = state.currentBoard ? sanitizeBoard(state.currentBoard) : undefined
    const base = {
      ...(currentBoard ? { boardID: currentBoard.boardID, currentBoard } : {}),
      elements: currentBoard?.elements.map((element) => ({ ...element })) ?? [],
      hasCurrentBoard: currentBoard !== undefined,
      ...(state.modelContext ? { modelContext: state.modelContext } : {}),
      ...(currentBoard?.viewport ? { viewport: currentBoard.viewport } : {}),
    }
    input.validateBase?.(base)
    const next = input.buildBoard(base)
    const validatedNext = {
      elements: next.elements.map((element, index) =>
        parsePersistableWhiteboardElement(element, index),
      ),
      ...(next.viewport ? { viewport: next.viewport } : {}),
    }
    if (input.shouldSave && !input.shouldSave({ base, next: validatedNext })) {
      return {
        state: toSessionRead(state),
        saved: false,
      }
    }
    const board = writeCurrentBoard(state, {
      origin: input.origin,
      elements: validatedNext.elements,
      ...(validatedNext.viewport ? { viewport: validatedNext.viewport } : {}),
    })
    if (input.recordModelContext) {
      state.modelContext = buildWhiteboardModelContext(board)
    }
    return {
      state: toSessionRead(state),
      saved: true,
    }
  })
}

async function saveWhiteboardRenderReport(input: {
  directory: string
  sessionID: string
  report: WhiteboardRenderReport
}): Promise<WhiteboardRenderReportSaveResponse> {
  assertWhiteboardPayloadWithinLimit("Whiteboard render report", JSON.stringify(input.report))
  const report = WhiteboardRenderReportSchema.parse(input.report)
  return mutateState(input.directory, input.sessionID, (state) => {
    if (!state.currentBoard || state.currentBoard.boardID !== report.boardID) {
      return WhiteboardRenderReportSaveResponseSchema.parse({ saved: false })
    }
    state.currentBoard = WhiteboardBoardSchema.parse({
      ...state.currentBoard,
      renderReport: report,
    })
    return WhiteboardRenderReportSaveResponseSchema.parse({ saved: true })
  })
}

async function waitForCurrentWhiteboardRenderReport(input: {
  directory: string
  sessionID: string
  boardID: string
}): Promise<WhiteboardBoard | undefined> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= RENDER_REPORT_WAIT_TIMEOUT_MS) {
    const context = await readWhiteboardBoardContext(input.directory, input.sessionID)
    const currentBoard = context.currentBoard
    if (currentBoard?.boardID === input.boardID && currentBoard.renderReport) {
      return currentBoard
    }
    await sleep(RENDER_REPORT_POLL_INTERVAL_MS)
  }
  return undefined
}

async function saveWhiteboardLearnerEdit(input: {
  directory: string
  sessionID: string
  edit: WhiteboardLearnerEditRequest
}): Promise<WhiteboardSessionRead> {
  assertWhiteboardPayloadWithinLimit("Whiteboard learner edit", JSON.stringify(input.edit))
  return mutateState(input.directory, input.sessionID, (state) => {
    if (!state.currentBoard || state.currentBoard.boardID !== input.edit.baseBoardID) {
      throw new WhiteboardStaleLearnerEditError()
    }
    const elements = input.edit.elements.map((element, index) =>
      parsePersistableWhiteboardElement(element, index),
    )
    saveLearnerBoard(state, {
      elements,
      ...(input.edit.viewport ? { viewport: input.edit.viewport } : {}),
    })
    return toSessionRead(state)
  })
}

export {
  readAndRecordWhiteboardBoardContext,
  readWhiteboardBoardContext,
  readWhiteboardSession,
  saveWhiteboardRenderReport,
  saveWhiteboardLearnerEdit,
  waitForCurrentWhiteboardRenderReport,
  WHITEBOARD_CONTINUATION_HANDLE,
  writeWhiteboardCurrentFromLatest,
}
export type { WhiteboardBoardBuildBase, WhiteboardCurrentWriteResult }
