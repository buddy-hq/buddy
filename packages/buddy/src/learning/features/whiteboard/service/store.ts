import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { monotonicFactory } from "ulid"
import {
  WhiteboardRevisionConflictError,
  WhiteboardRevisionNotFoundError,
  WhiteboardSceneNotFoundError,
} from "../errors"
import { WhiteboardPath } from "./path"
import { assertWhiteboardPayloadWithinLimit } from "./payload"
import {
  WhiteboardRevisionSchema,
  WhiteboardSessionReadSchema,
  WhiteboardSessionStateSchema,
  parsePersistableWhiteboardElement,
  sanitizeWhiteboardElements,
  type WhiteboardElement,
  type WhiteboardLearnerEditRequest,
  type WhiteboardRevision,
  type WhiteboardRevisionOrigin,
  type WhiteboardSessionRead,
  type WhiteboardSessionState,
  type WhiteboardViewport,
} from "./types"

const STATE_VERSION = 1
const MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS = 100
const mutationTails = new Map<string, Promise<void>>()
const createWhiteboardID = monotonicFactory()

type AppendRevisionInput = {
  sceneID: string
  origin: WhiteboardRevisionOrigin
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
  activateScene?: boolean
}

type WhiteboardRevisionBuildBase = {
  sceneID: string
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}

type WhiteboardRevisionBuildResult = {
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}

type WhiteboardRevisionAppendFromLatestResult = {
  state: WhiteboardSessionRead
  appended: boolean
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
    scenes: {},
    revisions: {},
  })
}

async function readState(directory: string, sessionID: string): Promise<WhiteboardSessionState> {
  const filepath = WhiteboardPath.sessionFile(directory, sessionID)
  try {
    const text = await fs.readFile(filepath, "utf8")
    return WhiteboardSessionStateSchema.parse(JSON.parse(text) as unknown)
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

function appendRevision(
  state: WhiteboardSessionState,
  input: AppendRevisionInput,
): WhiteboardRevision {
  const scene = state.scenes[input.sceneID]
  if (!scene) {
    throw new WhiteboardSceneNotFoundError(input.sceneID)
  }

  const revision = WhiteboardRevisionSchema.parse({
    revisionID: createWhiteboardID(),
    sceneID: input.sceneID,
    origin: input.origin,
    createdAt: new Date().toISOString(),
    elements: input.elements,
    ...(input.viewport ? { viewport: input.viewport } : {}),
  })
  state.revisions[revision.revisionID] = revision
  scene.revisionIDs.push(revision.revisionID)
  scene.headRevisionID = revision.revisionID
  enforceSceneRevisionLimit(state, input.sceneID)
  if (input.activateScene ?? true) {
    state.activeSceneID = input.sceneID
  }
  return revision
}

function createBlankSceneInState(state: WhiteboardSessionState) {
  const sceneID = createWhiteboardID()
  const revisionID = createWhiteboardID()
  const revision = WhiteboardRevisionSchema.parse({
    revisionID,
    sceneID,
    origin: "new-scene",
    createdAt: new Date().toISOString(),
    elements: [],
  })
  state.scenes[sceneID] = {
    sceneID,
    headRevisionID: revisionID,
    revisionIDs: [revisionID],
  }
  state.revisions[revisionID] = revision
  state.activeSceneID = sceneID
  return revision
}

function enforceSceneRevisionLimit(state: WhiteboardSessionState, sceneID: string): void {
  const scene = state.scenes[sceneID]
  if (!scene || scene.revisionIDs.length <= MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS) {
    return
  }

  scene.revisionIDs = scene.revisionIDs.slice(-MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS)
  const retainedRevisionIDs = new Set(
    Object.values(state.scenes).flatMap((candidate) => candidate.revisionIDs),
  )
  for (const revisionID of Object.keys(state.revisions)) {
    if (!retainedRevisionIDs.has(revisionID)) {
      delete state.revisions[revisionID]
    }
  }
}

function readSceneRevision(state: WhiteboardSessionState, revisionID: string) {
  const revision = state.revisions[revisionID]
  if (!revision) {
    throw new WhiteboardRevisionNotFoundError(revisionID)
  }
  return revision
}

function sanitizeRevision(revision: WhiteboardRevision): WhiteboardRevision {
  return WhiteboardRevisionSchema.parse({
    ...revision,
    elements: sanitizeWhiteboardElements(revision.elements),
  })
}

function toSessionRead(state: WhiteboardSessionState): WhiteboardSessionRead {
  const sceneID = state.activeSceneID
  if (!sceneID) {
    return { activeScene: null }
  }
  const scene = state.scenes[sceneID]
  if (!scene) {
    throw new WhiteboardSceneNotFoundError(sceneID)
  }
  const latestRevision = sanitizeRevision(readSceneRevision(state, scene.headRevisionID))
  return WhiteboardSessionReadSchema.parse({
    activeScene: {
      sceneID,
      continuationHandle: sceneID,
      headRevisionID: scene.headRevisionID,
      revisionCount: scene.revisionIDs.length,
      revisions: scene.revisionIDs.map((revisionID) => {
        const revision = sanitizeRevision(readSceneRevision(state, revisionID))
        return {
          revisionID,
          origin: revision.origin,
          createdAt: revision.createdAt,
          elementCount: revision.elements.length,
        }
      }),
      latestRevision,
    },
  })
}

async function readWhiteboardSession(
  directory: string,
  sessionID: string,
): Promise<WhiteboardSessionRead> {
  return toSessionRead(await readState(directory, sessionID))
}

async function readWhiteboardRevision(
  directory: string,
  sessionID: string,
  revisionID: string,
): Promise<WhiteboardRevision> {
  return sanitizeRevision(readSceneRevision(await readState(directory, sessionID), revisionID))
}

async function readWhiteboardSceneLatestRevision(
  directory: string,
  sessionID: string,
  sceneID: string,
): Promise<WhiteboardRevision> {
  const state = await readState(directory, sessionID)
  const scene = state.scenes[sceneID]
  if (!scene) {
    throw new WhiteboardSceneNotFoundError(sceneID)
  }
  return sanitizeRevision(readSceneRevision(state, scene.headRevisionID))
}

async function createBlankWhiteboardScene(
  directory: string,
  sessionID: string,
): Promise<WhiteboardSessionRead> {
  return mutateState(directory, sessionID, (state) => {
    createBlankSceneInState(state)
    return toSessionRead(state)
  })
}

async function appendWhiteboardRevision(input: {
  directory: string
  sessionID: string
  sceneID?: string
  origin: WhiteboardRevisionOrigin
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}): Promise<WhiteboardSessionRead> {
  return mutateState(input.directory, input.sessionID, (state) => {
    const initial = input.sceneID ? undefined : createBlankSceneInState(state)
    const sceneID = input.sceneID ?? initial?.sceneID
    if (!sceneID) {
      throw new Error("A whiteboard scene id is required.")
    }
    appendRevision(state, {
      sceneID,
      origin: input.origin,
      elements: input.elements.map((element, index) =>
        parsePersistableWhiteboardElement(element, index),
      ),
      ...(input.viewport ? { viewport: input.viewport } : {}),
    })
    return toSessionRead(state)
  })
}

async function appendWhiteboardRevisionFromLatest(input: {
  directory: string
  sessionID: string
  sceneID?: string
  origin: WhiteboardRevisionOrigin
  buildRevision: (base: WhiteboardRevisionBuildBase) => WhiteboardRevisionBuildResult
  shouldAppend?: (input: {
    base: WhiteboardRevisionBuildBase
    next: WhiteboardRevisionBuildResult
  }) => boolean
}): Promise<WhiteboardRevisionAppendFromLatestResult> {
  return mutateState(input.directory, input.sessionID, (state) => {
    const initial = input.sceneID ? undefined : createBlankSceneInState(state)
    const sceneID = input.sceneID ?? initial?.sceneID
    if (!sceneID) {
      throw new Error("A whiteboard scene id is required.")
    }
    const scene = state.scenes[sceneID]
    if (!scene) {
      throw new WhiteboardSceneNotFoundError(sceneID)
    }
    const latestRevision = sanitizeRevision(readSceneRevision(state, scene.headRevisionID))
    const base = {
      sceneID,
      elements: latestRevision.elements.map((element) => ({ ...element })),
      ...(latestRevision.viewport ? { viewport: latestRevision.viewport } : {}),
    }
    const next = input.buildRevision(base)
    const validatedNext = {
      elements: next.elements.map((element, index) =>
        parsePersistableWhiteboardElement(element, index),
      ),
      ...(next.viewport ? { viewport: next.viewport } : {}),
    }
    if (input.shouldAppend && !input.shouldAppend({ base, next: validatedNext })) {
      state.activeSceneID = sceneID
      return {
        state: toSessionRead(state),
        appended: false,
      }
    }
    appendRevision(state, {
      sceneID,
      origin: input.origin,
      elements: validatedNext.elements,
      ...(validatedNext.viewport ? { viewport: validatedNext.viewport } : {}),
    })
    return {
      state: toSessionRead(state),
      appended: true,
    }
  })
}

async function saveWhiteboardLearnerEdit(input: {
  directory: string
  sessionID: string
  sceneID: string
  edit: WhiteboardLearnerEditRequest
}): Promise<WhiteboardSessionRead> {
  assertWhiteboardPayloadWithinLimit("Whiteboard learner edit", JSON.stringify(input.edit))
  return mutateState(input.directory, input.sessionID, (state) => {
    const scene = state.scenes[input.sceneID]
    if (!scene) {
      throw new WhiteboardSceneNotFoundError(input.sceneID)
    }
    if (state.activeSceneID !== input.sceneID) {
      throw new WhiteboardRevisionConflictError()
    }
    if (scene.headRevisionID !== input.edit.baseRevisionID) {
      throw new WhiteboardRevisionConflictError()
    }
    appendRevision(state, {
      sceneID: input.sceneID,
      origin: "learner",
      elements: input.edit.elements.map((element, index) =>
        parsePersistableWhiteboardElement(element, index),
      ),
      ...(input.edit.viewport ? { viewport: input.edit.viewport } : {}),
      activateScene: false,
    })
    return toSessionRead(state)
  })
}

export {
  appendWhiteboardRevision,
  appendWhiteboardRevisionFromLatest,
  createBlankWhiteboardScene,
  MAX_RETAINED_WHITEBOARD_SCENE_REVISIONS,
  readWhiteboardRevision,
  readWhiteboardSceneLatestRevision,
  readWhiteboardSession,
  saveWhiteboardLearnerEdit,
}
