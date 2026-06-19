import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { monotonicFactory } from "ulid"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectManifestSchema,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  WhiteboardObjectSummarySchema,
  generateObjectID,
  listObjects,
  readObjectManifest,
  registerBuddyObjectKind,
  writeObjectManifest,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import { WhiteboardSessionConflictError, WhiteboardStaleLearnerEditError } from "../errors"
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
const WHITEBOARD_CURRENT_VIEW_ID = "current"
const RENDER_REPORT_WAIT_TIMEOUT_MS = 4_000
const RENDER_REPORT_POLL_INTERVAL_MS = 100
const sessionMutationTails = new Map<string, Promise<void>>()
const createWhiteboardID = monotonicFactory()
const WhiteboardSessionIndexSchema = z.record(z.string().trim().min(1), BuddyObjectIDSchema)
const whiteboardManifestSchema = BuddyObjectManifestSchema.safeExtend({
  summary: WhiteboardObjectSummarySchema,
})

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

type WhiteboardSessionIndex = z.infer<typeof WhiteboardSessionIndexSchema>
type WhiteboardObjectManifest = BuddyObjectManifest & {
  summary: ReturnType<typeof WhiteboardObjectSummarySchema.parse>
}

function withWhiteboardSessionMutationLock<T>(
  directory: string,
  sessionID: string,
  task: (sanitizedSessionID: string) => Promise<T>,
): Promise<T> {
  const sanitizedSessionID = WhiteboardPath.sanitizeSessionID(sessionID)
  const key = JSON.stringify([path.resolve(directory), sanitizedSessionID])
  const previous = sessionMutationTails.get(key) ?? Promise.resolve()
  const run = previous.then(
    () => task(sanitizedSessionID),
    () => task(sanitizedSessionID),
  )
  const next = run.then(
    () => undefined,
    () => undefined,
  )
  sessionMutationTails.set(key, next)
  return run.finally(() => {
    if (sessionMutationTails.get(key) === next) {
      sessionMutationTails.delete(key)
    }
  })
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

const WHITEBOARD_SESSION_STATE_RELATIVE_PATH = "state/session.json"

async function readWhiteboardSessionIndex(directory: string): Promise<WhiteboardSessionIndex> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(WhiteboardPath.sessionIndexFile(directory), "utf8"),
    )
    return WhiteboardSessionIndexSchema.parse(parsed)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {}
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return {}
    }
    throw error
  }
}

async function writeWhiteboardSessionIndex(
  directory: string,
  index: WhiteboardSessionIndex,
): Promise<void> {
  await writeAtomicJson(WhiteboardPath.sessionIndexFile(directory), WhiteboardSessionIndexSchema.parse(index))
}

function buildWhiteboardObjectViews(): BuddyObjectManifest["views"] {
  return [
    {
      viewID: WHITEBOARD_CURRENT_VIEW_ID,
      label: "Whiteboard",
      surfaces: ["bench", "context"],
      availability: { status: "available" },
      bench: { resolver: "object-view" },
      context: {
        toolID: "whiteboard_read_context",
        refs: [{ label: "continuationHandle", value: WHITEBOARD_CONTINUATION_HANDLE }],
      },
    },
  ]
}

async function createWhiteboardObjectForSession(input: {
  directory: string
  sessionID: string
}): Promise<WhiteboardObjectManifest> {
  const sessionID = WhiteboardPath.sanitizeSessionID(input.sessionID)
  const objectID = generateObjectID()
  const now = new Date().toISOString()
  const manifest = whiteboardManifestSchema.parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    title: "Whiteboard",
    status: "ready",
    lifecycle: "live",
    createdAt: now,
    updatedAt: now,
    sourceRefs: [],
    views: buildWhiteboardObjectViews(),
    summary: {
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      sessionID,
      boardID: null,
      continuationHandle: WHITEBOARD_CONTINUATION_HANDLE,
    },
  })
  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    manifest,
    files: [
      {
        relativePath: WHITEBOARD_SESSION_STATE_RELATIVE_PATH,
        format: "json",
        content: emptyState(sessionID),
      },
    ],
  })
  const index = await readWhiteboardSessionIndex(input.directory)
  index[sessionID] = objectID
  await writeWhiteboardSessionIndex(input.directory, index)
  return manifest
}

async function readWhiteboardObjectManifest(input: {
  directory: string
  objectID: string
}): Promise<WhiteboardObjectManifest> {
  return whiteboardManifestSchema.parse(await readObjectManifest({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.whiteboard,
    objectID: input.objectID,
  }))
}

async function rebuildWhiteboardSessionIndex(directory: string): Promise<WhiteboardSessionIndex> {
  const listed = await listObjects({ directory, kind: BUDDY_OBJECT_KINDS.whiteboard })
  const index: WhiteboardSessionIndex = {}
  const objectIDsBySession = new Map<string, string[]>()
  for (const item of listed.objects) {
    const manifest = await readWhiteboardObjectManifest({
      directory,
      objectID: item.objectID,
    }).catch(() => undefined)
    if (!manifest) continue
    const objectIDs = objectIDsBySession.get(manifest.summary.sessionID) ?? []
    objectIDs.push(manifest.objectID)
    objectIDsBySession.set(manifest.summary.sessionID, objectIDs)
  }
  for (const [sessionID, objectIDs] of objectIDsBySession) {
    if (objectIDs.length > 1) {
      throw new WhiteboardSessionConflictError(sessionID, objectIDs)
    }
    const objectID = objectIDs[0]
    if (objectID) {
      index[sessionID] = objectID
    }
  }
  await writeWhiteboardSessionIndex(directory, index)
  return index
}

async function resolveWhiteboardObjectForSession(input: {
  directory: string
  sessionID: string
  createIfMissing: boolean
}): Promise<WhiteboardObjectManifest | undefined> {
  const sessionID = WhiteboardPath.sanitizeSessionID(input.sessionID)
  const indexedObjectID = (await readWhiteboardSessionIndex(input.directory))[sessionID]
  if (indexedObjectID) {
    const manifest = await readWhiteboardObjectManifest({
      directory: input.directory,
      objectID: indexedObjectID,
    }).catch(() => undefined)
    if (manifest?.summary.sessionID === sessionID) {
      return manifest
    }
  }
  const rebuiltObjectID = (await rebuildWhiteboardSessionIndex(input.directory))[sessionID]
  if (rebuiltObjectID) {
    return readWhiteboardObjectManifest({
      directory: input.directory,
      objectID: rebuiltObjectID,
    })
  }
  return input.createIfMissing
    ? createWhiteboardObjectForSession({
        directory: input.directory,
        sessionID,
      })
    : undefined
}

async function readState(directory: string, sessionID: string): Promise<WhiteboardSessionState> {
  const manifest = await resolveWhiteboardObjectForSession({
    directory,
    sessionID,
    createIfMissing: false,
  })
  if (!manifest) {
    return emptyState(WhiteboardPath.sanitizeSessionID(sessionID))
  }
  const filepath = WhiteboardPath.sessionStateFile(directory, manifest.objectID)
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filepath, "utf8"))
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

async function updateWhiteboardObjectManifestFromState(input: {
  directory: string
  objectID: string
  state: WhiteboardSessionState
}): Promise<void> {
  const manifest = await readWhiteboardObjectManifest({
    directory: input.directory,
    objectID: input.objectID,
  })
  await writeObjectManifest({
    directory: input.directory,
    manifest: whiteboardManifestSchema.parse({
      ...manifest,
      updatedAt: new Date().toISOString(),
      summary: {
        ...manifest.summary,
        boardID: input.state.currentBoard?.boardID ?? null,
      },
    }),
  })
}

async function mutateState<T>(
  directory: string,
  sessionID: string,
  mutate: (state: WhiteboardSessionState, objectID: string) => T | Promise<T>,
): Promise<T> {
  return withWhiteboardSessionMutationLock(directory, sessionID, async (sanitizedSessionID) => {
    const manifest = await resolveWhiteboardObjectForSession({
      directory,
      sessionID: sanitizedSessionID,
      createIfMissing: true,
    })
    if (!manifest) {
      throw new Error(`Unable to create whiteboard object for session ${sanitizedSessionID}.`)
    }
    const filepath = WhiteboardPath.sessionStateFile(directory, manifest.objectID)
    const state = await readState(directory, sessionID)
    const result = await mutate(state, manifest.objectID)
    await writeAtomicJson(filepath, state)
    await updateWhiteboardObjectManifestFromState({
      directory,
      objectID: manifest.objectID,
      state,
    })
    return result
  })
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

function toSessionRead(input: {
  state: WhiteboardSessionState
  objectID: string | null
}): WhiteboardSessionRead {
  return WhiteboardSessionReadSchema.parse({
    objectID: input.objectID,
    currentBoard: input.state.currentBoard
      ? withoutRenderReport(sanitizeBoard(input.state.currentBoard))
      : null,
  })
}

async function readWhiteboardSession(
  directory: string,
  sessionID: string,
): Promise<WhiteboardSessionRead> {
  const state = await readState(directory, sessionID)
  const manifest = await resolveWhiteboardObjectForSession({
    directory,
    sessionID,
    createIfMissing: false,
  })
  return toSessionRead({
    state,
    objectID: manifest?.objectID ?? null,
  })
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
  return withWhiteboardSessionMutationLock(directory, sessionID, async (sanitizedSessionID) => {
    const manifest = await resolveWhiteboardObjectForSession({
      directory,
      sessionID: sanitizedSessionID,
      createIfMissing: false,
    })
    if (!manifest) {
      return { currentBoard: null }
    }
    const state = await readState(directory, sanitizedSessionID)
    const currentBoard = state.currentBoard ? sanitizeBoard(state.currentBoard) : undefined
    if (currentBoard) {
      state.modelContext = buildWhiteboardModelContext(currentBoard)
      await writeAtomicJson(WhiteboardPath.sessionStateFile(directory, manifest.objectID), state)
      await updateWhiteboardObjectManifestFromState({
        directory,
        objectID: manifest.objectID,
        state,
      })
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
  return mutateState(input.directory, input.sessionID, (state, objectID) => {
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
        state: toSessionRead({ state, objectID }),
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
      state: toSessionRead({ state, objectID }),
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
  return mutateState(input.directory, input.sessionID, (state, _objectID) => {
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
  return mutateState(input.directory, input.sessionID, (state, objectID) => {
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
    return toSessionRead({ state, objectID })
  })
}

async function ensureWhiteboardObjectForSession(input: {
  directory: string
  sessionID: string
}): Promise<WhiteboardObjectManifest> {
  return withWhiteboardSessionMutationLock(
    input.directory,
    input.sessionID,
    async (sanitizedSessionID) => {
      const manifest = await resolveWhiteboardObjectForSession({
        directory: input.directory,
        sessionID: sanitizedSessionID,
        createIfMissing: true,
      })
      if (!manifest) {
        throw new Error(`Unable to create whiteboard object for session ${sanitizedSessionID}.`)
      }
      return manifest
    },
  )
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.whiteboard,
  manifestSchema: whiteboardManifestSchema,
  async readManifest(input): Promise<WhiteboardObjectManifest> {
    return readWhiteboardObjectManifest({
      directory: input.directory,
      objectID: input.ref.objectID,
    })
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== WHITEBOARD_CURRENT_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported whiteboard view: ${input.viewID}`)
    }
    const manifest = await readWhiteboardObjectManifest({
      directory: input.directory,
      objectID: input.ref.objectID,
    })
    const state = await readState(input.directory, manifest.summary.sessionID)
    return BuddyObjectViewResponseSchema.parse({
      ref: {
        kind: BUDDY_OBJECT_KINDS.whiteboard,
        objectID: manifest.objectID,
        revisionID: null,
        itemID: null,
      },
      viewID: WHITEBOARD_CURRENT_VIEW_ID,
      title: manifest.title,
      data: {
        renderer: "whiteboard",
        sessionID: manifest.summary.sessionID,
        boardID: state.currentBoard?.boardID ?? null,
        continuationHandle: WHITEBOARD_CONTINUATION_HANDLE,
        elementCount: state.currentBoard?.elements.length ?? 0,
      },
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== WHITEBOARD_CURRENT_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_whiteboard_view",
        message: `Unsupported whiteboard Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: {
          kind: BUDDY_OBJECT_KINDS.whiteboard,
          objectID: input.ref.objectID,
          revisionID: null,
          itemID: null,
        },
        viewID: WHITEBOARD_CURRENT_VIEW_ID,
      },
    }
  },
})

export {
  ensureWhiteboardObjectForSession,
  readAndRecordWhiteboardBoardContext,
  readWhiteboardBoardContext,
  readWhiteboardSession,
  saveWhiteboardRenderReport,
  saveWhiteboardLearnerEdit,
  waitForCurrentWhiteboardRenderReport,
  WHITEBOARD_CURRENT_VIEW_ID,
  WHITEBOARD_CONTINUATION_HANDLE,
  writeWhiteboardCurrentFromLatest,
}
export type { WhiteboardBoardBuildBase, WhiteboardCurrentWriteResult }
