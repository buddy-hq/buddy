import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { monotonicFactory } from "ulid"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectManifestSchema,
  BuddyObjectNotFoundError,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  WhiteboardObjectSummarySchema,
  generateObjectID,
  readObjectManifest,
  registerBuddyObjectKind,
  writeObjectManifest,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectOrigin,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import { WhiteboardStaleLearnerEditError } from "../errors"
import { WhiteboardPath } from "./path"
import { assertWhiteboardPayloadWithinLimit } from "./payload"
import { buildWhiteboardModelContext } from "./model-context"
import {
  WhiteboardBoardSchema,
  WhiteboardCreationReservationRequestSchema,
  WhiteboardCreationReservationResponseSchema,
  LegacyWhiteboardSessionStateSchema,
  WhiteboardRenderReportSaveResponseSchema,
  WhiteboardRenderReportSchema,
  WhiteboardObjectReadSchema,
  WhiteboardObjectStateSchema,
  parsePersistableWhiteboardElement,
  sanitizeWhiteboardElements,
  type WhiteboardBoard,
  type WhiteboardBoardOrigin,
  type WhiteboardCreationReservationRequest,
  type WhiteboardCreationReservationResponse,
  type WhiteboardElement,
  type WhiteboardLearnerEditRequest,
  type WhiteboardRenderReport,
  type WhiteboardRenderReportSaveResponse,
  type WhiteboardObjectBoard,
  type WhiteboardObjectRead,
  type WhiteboardObjectState,
  type WhiteboardViewport,
} from "./types"

const STATE_VERSION = 3
const WHITEBOARD_CONTINUATION_HANDLE = "current"
const WHITEBOARD_CURRENT_VIEW_ID = "current"
const RENDER_REPORT_WAIT_TIMEOUT_MS = 4_000
const RENDER_REPORT_POLL_INTERVAL_MS = 100
const DEFAULT_WHITEBOARD_TITLE = "Whiteboard"
const objectMutationTails = new Map<string, Promise<void>>()
const creationReservationTails = new Map<string, Promise<void>>()
const createWhiteboardID = monotonicFactory()
const whiteboardManifestSchema = BuddyObjectManifestSchema.safeExtend({
  summary: WhiteboardObjectSummarySchema,
})
const whiteboardCreationReservationRecordSchema = WhiteboardCreationReservationRequestSchema.extend(
  {
    version: z.literal(1),
    objectID: BuddyObjectIDSchema,
  },
).strict()

type WhiteboardBoardBuildBase = {
  boardID?: string
  elements: WhiteboardElement[]
  hasCurrentBoard: boolean
  currentBoard?: WhiteboardBoard
  modelContext?: WhiteboardObjectState["modelContext"]
  viewport?: WhiteboardViewport
}

type WhiteboardBoardBuildResult = {
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}

type WhiteboardCurrentWriteResult = {
  state: WhiteboardObjectRead
  saved: boolean
}

type WhiteboardObjectManifest = BuddyObjectManifest & {
  summary: ReturnType<typeof WhiteboardObjectSummarySchema.parse>
}

type WhiteboardCreationReservationRecord = z.infer<typeof whiteboardCreationReservationRecordSchema>

function withWhiteboardObjectMutationLock<T>(
  directory: string,
  objectID: string,
  task: (objectID: string) => Promise<T>,
): Promise<T> {
  const validatedObjectID = BuddyObjectIDSchema.parse(objectID)
  const key = JSON.stringify([path.resolve(directory), validatedObjectID])
  const previous = objectMutationTails.get(key) ?? Promise.resolve()
  const run = previous.then(
    () => task(validatedObjectID),
    () => task(validatedObjectID),
  )
  const next = run.then(
    () => undefined,
    () => undefined,
  )
  objectMutationTails.set(key, next)
  return run.finally(() => {
    if (objectMutationTails.get(key) === next) {
      objectMutationTails.delete(key)
    }
  })
}

function isFileNotFound(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT"
}

function isFileAlreadyExists(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST"
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

function emptyState(): WhiteboardObjectState {
  return WhiteboardObjectStateSchema.parse({
    version: STATE_VERSION,
  })
}

const WHITEBOARD_OBJECT_STATE_RELATIVE_PATH = "state/whiteboard.json"

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
        refs: [],
      },
    },
  ]
}

async function createWhiteboardObject(input: {
  directory: string
  objectID?: string
  title?: string
  origin?: BuddyObjectOrigin
  initialBoard?: {
    origin: WhiteboardBoardOrigin
    elements: WhiteboardElement[]
    viewport?: WhiteboardViewport
  }
}): Promise<WhiteboardObjectManifest> {
  const objectID = input.objectID ? BuddyObjectIDSchema.parse(input.objectID) : generateObjectID()
  const now = new Date().toISOString()
  const state = emptyState()
  const initialBoard = input.initialBoard ? writeCurrentBoard(state, input.initialBoard) : undefined
  const manifest = whiteboardManifestSchema.parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    title: input.title ?? DEFAULT_WHITEBOARD_TITLE,
    status: "ready",
    lifecycle: "live",
    createdAt: now,
    updatedAt: now,
    ...(input.origin ? { origin: input.origin } : {}),
    sourceRefs: [],
    views: buildWhiteboardObjectViews(),
    summary: {
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      boardID: initialBoard?.boardID ?? null,
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
        relativePath: WHITEBOARD_OBJECT_STATE_RELATIVE_PATH,
        format: "json",
        content: state,
      },
    ],
  })
  return manifest
}

async function createBlankWhiteboardObject(input: {
  directory: string
  origin?: BuddyObjectOrigin
}): Promise<WhiteboardObjectRead> {
  const manifest = await createWhiteboardObject({
    directory: input.directory,
    ...(input.origin ? { origin: input.origin } : {}),
    initialBoard: {
      origin: "learner",
      elements: [],
    },
  })
  return readWhiteboardObject(input.directory, manifest.objectID)
}

function creationReservationIdentityKey(input: WhiteboardCreationReservationRequest): string {
  return JSON.stringify([input.sessionID, input.messageID, input.callID])
}

function creationReservationDigest(input: WhiteboardCreationReservationRequest): string {
  return createHash("sha256").update(creationReservationIdentityKey(input)).digest("hex")
}

function withCreationReservationLock<T>(
  directory: string,
  reservation: WhiteboardCreationReservationRequest,
  task: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([path.resolve(directory), creationReservationIdentityKey(reservation)])
  const previous = creationReservationTails.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const next = run.then(
    () => undefined,
    () => undefined,
  )
  creationReservationTails.set(key, next)
  return run.finally(() => {
    if (creationReservationTails.get(key) === next) {
      creationReservationTails.delete(key)
    }
  })
}

async function readCreationReservation(
  filepath: string,
): Promise<WhiteboardCreationReservationRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filepath, "utf8"))
    return whiteboardCreationReservationRecordSchema.parse(parsed)
  } catch (error) {
    if (isFileNotFound(error)) return undefined
    throw error
  }
}

async function claimCreationReservation(input: {
  filepath: string
  record: WhiteboardCreationReservationRecord
}): Promise<WhiteboardCreationReservationRecord> {
  await fs.mkdir(path.dirname(input.filepath), { recursive: true })
  try {
    await fs.writeFile(input.filepath, `${JSON.stringify(input.record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    })
    return input.record
  } catch (error) {
    if (!isFileAlreadyExists(error)) throw error
    const existing = await readCreationReservation(input.filepath)
    if (!existing) {
      throw new Error("Whiteboard creation reservation disappeared after it was claimed.", {
        cause: error,
      })
    }
    return existing
  }
}

async function ensureWhiteboardObjectForToolCall(input: {
  directory: string
  reservation: WhiteboardCreationReservationRequest
  title?: string
}): Promise<WhiteboardCreationReservationResponse> {
  const reservation = WhiteboardCreationReservationRequestSchema.parse(input.reservation)
  return withCreationReservationLock(input.directory, reservation, async () => {
    const filepath = WhiteboardPath.creationReservationFile(
      input.directory,
      creationReservationDigest(reservation),
    )
    const existing = await readCreationReservation(filepath)
    const record =
      existing ??
      (await claimCreationReservation({
        filepath,
        record: whiteboardCreationReservationRecordSchema.parse({
          version: 1,
          ...reservation,
          objectID: generateObjectID(),
        }),
      }))
    if (
      record.sessionID !== reservation.sessionID ||
      record.messageID !== reservation.messageID ||
      record.callID !== reservation.callID
    ) {
      throw new Error("Whiteboard creation reservation identity collision.")
    }

    try {
      await readWhiteboardObjectManifest({
        directory: input.directory,
        objectID: record.objectID,
      })
    } catch (error) {
      if (!(error instanceof BuddyObjectNotFoundError)) throw error
      await createWhiteboardObject({
        directory: input.directory,
        objectID: record.objectID,
        ...(input.title ? { title: input.title } : {}),
        origin: {
          kind: "tool",
          sessionID: reservation.sessionID,
          messageID: reservation.messageID,
          callID: reservation.callID,
        },
      })
    }

    return WhiteboardCreationReservationResponseSchema.parse({
      objectID: record.objectID,
    })
  })
}

async function readWhiteboardObjectManifest(input: {
  directory: string
  objectID: string
}): Promise<WhiteboardObjectManifest> {
  const manifest = whiteboardManifestSchema.parse(
    await readObjectManifest({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID: input.objectID,
    }),
  )
  if (!manifest.summary.sessionID) return manifest

  const { sessionID: _legacySessionID, ...summary } = manifest.summary
  const migrated = whiteboardManifestSchema.parse({
    ...manifest,
    updatedAt: new Date().toISOString(),
    summary,
  })
  await writeObjectManifest({ directory: input.directory, manifest: migrated })
  return migrated
}

async function readState(directory: string, objectID: string): Promise<WhiteboardObjectState> {
  const validatedObjectID = BuddyObjectIDSchema.parse(objectID)
  const filepath = WhiteboardPath.objectStateFile(directory, validatedObjectID)
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filepath, "utf8"))
    return WhiteboardObjectStateSchema.parse(parsed)
  } catch (error) {
    if (!isFileNotFound(error)) throw error
  }

  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(
        WhiteboardPath.legacySessionStateFile(directory, validatedObjectID),
        "utf8",
      ),
    )
    const legacy = LegacyWhiteboardSessionStateSchema.parse(parsed)
    const migrated = WhiteboardObjectStateSchema.parse({
      version: STATE_VERSION,
      ...(legacy.currentBoard ? { currentBoard: legacy.currentBoard } : {}),
      ...(legacy.previousBoard ? { previousBoard: legacy.previousBoard } : {}),
      ...(legacy.modelContext ? { modelContext: legacy.modelContext } : {}),
    })
    await writeAtomicJson(filepath, migrated)
    return migrated
  } catch (error) {
    if (!isFileNotFound(error)) throw error
  }

  return emptyState()
}

async function updateWhiteboardObjectManifestFromState(input: {
  directory: string
  objectID: string
  state: WhiteboardObjectState
  title?: string
}): Promise<void> {
  const manifest = await readWhiteboardObjectManifest({
    directory: input.directory,
    objectID: input.objectID,
  })
  await writeObjectManifest({
    directory: input.directory,
    manifest: whiteboardManifestSchema.parse({
      ...manifest,
      ...(input.title ? { title: input.title } : {}),
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
  objectID: string,
  mutate: (state: WhiteboardObjectState, objectID: string) => T | Promise<T>,
  title?: string,
): Promise<T> {
  return withWhiteboardObjectMutationLock(directory, objectID, async (validatedObjectID) => {
    const manifest = await readWhiteboardObjectManifest({
      directory,
      objectID: validatedObjectID,
    })
    const filepath = WhiteboardPath.objectStateFile(directory, manifest.objectID)
    const state = await readState(directory, manifest.objectID)
    const result = await mutate(state, manifest.objectID)
    await writeAtomicJson(filepath, state)
    await updateWhiteboardObjectManifestFromState({
      directory,
      objectID: manifest.objectID,
      state,
      ...(title ? { title } : {}),
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

function withoutRenderReport(board: WhiteboardBoard): WhiteboardObjectBoard {
  const { renderReport: _renderReport, ...objectBoard } = board
  return objectBoard
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
  state: WhiteboardObjectState,
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
  state: WhiteboardObjectState,
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

function toObjectRead(input: {
  state: WhiteboardObjectState
  objectID: string
}): WhiteboardObjectRead {
  return WhiteboardObjectReadSchema.parse({
    objectID: input.objectID,
    currentBoard: input.state.currentBoard
      ? withoutRenderReport(sanitizeBoard(input.state.currentBoard))
      : null,
  })
}

async function readWhiteboardObject(
  directory: string,
  objectID: string,
): Promise<WhiteboardObjectRead> {
  const manifest = await readWhiteboardObjectManifest({
    directory,
    objectID,
  })
  const state = await readState(directory, manifest.objectID)
  return toObjectRead({
    state,
    objectID: manifest.objectID,
  })
}

async function readWhiteboardBoardContext(
  directory: string,
  objectID: string,
): Promise<{
  currentBoard: WhiteboardBoard | null
  previousBoard?: WhiteboardBoard
}> {
  const manifest = await readWhiteboardObjectManifest({ directory, objectID })
  const state = await readState(directory, manifest.objectID)
  return {
    currentBoard: state.currentBoard ? sanitizeBoard(state.currentBoard) : null,
    ...(state.previousBoard ? { previousBoard: sanitizeBoard(state.previousBoard) } : {}),
  }
}

async function readAndRecordWhiteboardBoardContext(
  directory: string,
  objectID: string,
): Promise<{
  currentBoard: WhiteboardBoard | null
  previousBoard?: WhiteboardBoard
}> {
  return withWhiteboardObjectMutationLock(directory, objectID, async (validatedObjectID) => {
    const manifest = await readWhiteboardObjectManifest({
      directory,
      objectID: validatedObjectID,
    })
    const state = await readState(directory, manifest.objectID)
    const currentBoard = state.currentBoard ? sanitizeBoard(state.currentBoard) : undefined
    if (currentBoard) {
      state.modelContext = buildWhiteboardModelContext(currentBoard)
      await writeAtomicJson(WhiteboardPath.objectStateFile(directory, manifest.objectID), state)
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
  objectID: string
  title?: string
  origin: WhiteboardBoardOrigin
  buildBoard: (base: WhiteboardBoardBuildBase) => WhiteboardBoardBuildResult
  validateBase?: (base: WhiteboardBoardBuildBase) => void
  recordModelContext?: boolean
  shouldSave?: (input: {
    base: WhiteboardBoardBuildBase
    next: WhiteboardBoardBuildResult
  }) => boolean
}): Promise<WhiteboardCurrentWriteResult> {
  return mutateState(
    input.directory,
    input.objectID,
    (state, objectID) => {
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
          state: toObjectRead({ state, objectID }),
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
        state: toObjectRead({ state, objectID }),
        saved: true,
      }
    },
    input.title,
  )
}

async function saveWhiteboardRenderReport(input: {
  directory: string
  objectID: string
  report: WhiteboardRenderReport
}): Promise<WhiteboardRenderReportSaveResponse> {
  assertWhiteboardPayloadWithinLimit("Whiteboard render report", JSON.stringify(input.report))
  const report = WhiteboardRenderReportSchema.parse(input.report)
  return mutateState(input.directory, input.objectID, (state, _objectID) => {
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
  objectID: string
  boardID: string
}): Promise<WhiteboardBoard | undefined> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= RENDER_REPORT_WAIT_TIMEOUT_MS) {
    const context = await readWhiteboardBoardContext(input.directory, input.objectID)
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
  objectID: string
  edit: WhiteboardLearnerEditRequest
}): Promise<WhiteboardObjectRead> {
  assertWhiteboardPayloadWithinLimit("Whiteboard learner edit", JSON.stringify(input.edit))
  return mutateState(input.directory, input.objectID, (state, objectID) => {
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
    return toObjectRead({ state, objectID })
  })
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
    const state = await readState(input.directory, manifest.objectID)
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
        objectID: manifest.objectID,
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
  createBlankWhiteboardObject,
  createWhiteboardObject,
  ensureWhiteboardObjectForToolCall,
  readAndRecordWhiteboardBoardContext,
  readWhiteboardBoardContext,
  readWhiteboardObject,
  saveWhiteboardRenderReport,
  saveWhiteboardLearnerEdit,
  waitForCurrentWhiteboardRenderReport,
  WHITEBOARD_CURRENT_VIEW_ID,
  WHITEBOARD_CONTINUATION_HANDLE,
  writeWhiteboardCurrentFromLatest,
}
export type { WhiteboardBoardBuildBase, WhiteboardCurrentWriteResult }
