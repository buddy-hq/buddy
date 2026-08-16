// cspell:ignore Persistable
import z from "zod"
import { WHITEBOARD_CONTINUATION_HANDLE, writeWhiteboardCurrentFromLatest } from "./store"
import { WhiteboardElementValidationError } from "../errors"
import { assertWhiteboardTouchedAnchorsFresh } from "./model-context"
import {
  WhiteboardViewportSchema,
  parsePersistableWhiteboardElement,
  type WhiteboardBoard,
  type WhiteboardBoardOrigin,
  type WhiteboardElement,
  type WhiteboardObjectRead,
  type WhiteboardViewport,
} from "./types"
import { assertWhiteboardPayloadWithinLimit } from "./payload"

const PSEUDO_ELEMENT_TYPES = new Set([
  "restoreCheckpoint",
  "replaceCurrentBoard",
  "delete",
  "cameraUpdate",
  "translate",
])

const RestoreCheckpointSchema = z
  .object({
    type: z.literal("restoreCheckpoint"),
    id: z.string().trim().min(1),
  })
  .strict()

const ReplaceCurrentBoardSchema = z
  .object({
    type: z.literal("replaceCurrentBoard"),
  })
  .strict()

const DeleteElementSchema = z
  .object({
    type: z.literal("delete"),
    ids: z.string().trim().min(1).optional(),
    id: z.string().trim().min(1).optional(),
  })
  .strict()

const CameraUpdateSchema = z
  .object({
    type: z.literal("cameraUpdate"),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict()

const TranslateElementsSchema = z
  .object({
    type: z.literal("translate"),
    ids: z.string().trim().min(1),
    dx: z.number().finite(),
    dy: z.number().finite(),
  })
  .strict()

const CAMERA_TARGET_ASPECT_RATIO = 4 / 3
const CAMERA_ASPECT_RATIO_TOLERANCE = 0.15

type WhiteboardProgramResult = {
  state: WhiteboardObjectRead
  continuationHandle: string
  boardID: string
  saved: boolean
  warnings: string[]
  layoutPriorityElementIDs: string[]
}

type WhiteboardProgramBase = {
  elements: WhiteboardElement[]
  hasCurrentBoard: boolean
  viewport?: WhiteboardViewport
}

type WhiteboardProgramWriteMode = "auto" | "continue" | "replace"
type WhiteboardProgramRequestedWriteMode = Exclude<WhiteboardProgramWriteMode, "auto">

function parseDrawingProgram(elements: string): unknown[] {
  assertWhiteboardPayloadWithinLimit("Whiteboard drawing program", elements)

  let parsed: unknown
  try {
    parsed = JSON.parse(elements) as unknown
  } catch (error) {
    throw new Error(
      `Whiteboard elements must be a valid compact JSON array string. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Whiteboard elements must decode to a JSON array.")
  }
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readElementType(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || value.type.trim().length === 0) {
    return undefined
  }
  return value.type
}

function parseCommaSeparatedIDs(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  const parsed = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  return parsed.length === 0 ? undefined : parsed
}

function parseDeleteIDs(input: { ids?: string; id?: string }): string[] | undefined {
  const raw = input.ids ?? input.id
  return parseCommaSeparatedIDs(raw)
}

function addIDsToSet(input: { ids: string[] | undefined; target: Set<string> }): void {
  if (!input.ids) return
  for (const id of input.ids) {
    input.target.add(id)
  }
}

function addReferencedElementID(value: unknown, touchedIDs: Set<string>): void {
  if (!isRecord(value)) return
  const elementID = value.elementId
  if (typeof elementID === "string" && elementID.trim().length > 0) {
    touchedIDs.add(elementID)
  }
}

function collectTouchedIDs(program: unknown[]): Set<string> {
  const touchedIDs = new Set<string>()
  for (const value of program) {
    const type = readElementType(value)
    if (type === "delete") {
      const deletion = DeleteElementSchema.safeParse(value)
      if (deletion.success) {
        addIDsToSet({ ids: parseDeleteIDs(deletion.data), target: touchedIDs })
      }
      continue
    }
    if (type === "translate") {
      const translation = TranslateElementsSchema.safeParse(value)
      if (translation.success) {
        addIDsToSet({ ids: parseCommaSeparatedIDs(translation.data.ids), target: touchedIDs })
      }
      continue
    }
    if (!isRecord(value) || PSEUDO_ELEMENT_TYPES.has(type ?? "")) continue
    if (typeof value.containerId === "string" && value.containerId.trim().length > 0) {
      touchedIDs.add(value.containerId)
    }
    addReferencedElementID(value.startBinding, touchedIDs)
    addReferencedElementID(value.endBinding, touchedIDs)
  }
  return touchedIDs
}

function addOwnElementID(value: unknown, elementIDs: Set<string>): void {
  if (!isRecord(value)) return
  if (typeof value.id === "string" && value.id.trim().length > 0) {
    elementIDs.add(value.id)
  }
}

function collectLayoutPriorityElementIDs(program: unknown[]): Set<string> {
  const elementIDs = new Set<string>()
  for (const value of program) {
    const type = readElementType(value)
    if (type === "delete") {
      const deletion = DeleteElementSchema.safeParse(value)
      if (deletion.success) {
        addIDsToSet({ ids: parseDeleteIDs(deletion.data), target: elementIDs })
      }
      continue
    }
    if (type === "translate") {
      const translation = TranslateElementsSchema.safeParse(value)
      if (translation.success) {
        addIDsToSet({
          ids: parseCommaSeparatedIDs(translation.data.ids),
          target: elementIDs,
        })
      }
      continue
    }
    if (!isRecord(value) || PSEUDO_ELEMENT_TYPES.has(type ?? "")) continue
    addOwnElementID(value, elementIDs)
    if (typeof value.containerId === "string" && value.containerId.trim().length > 0) {
      elementIDs.add(value.containerId)
    }
    addReferencedElementID(value.startBinding, elementIDs)
    addReferencedElementID(value.endBinding, elementIDs)
  }
  return elementIDs
}

function withoutDeletedElements(
  elements: WhiteboardElement[],
  ids: Set<string>,
): WhiteboardElement[] {
  return elements.filter((element) => {
    if (ids.has(element.id)) return false
    return typeof element.containerId !== "string" || !ids.has(element.containerId)
  })
}

function buildProgramStateSignature(input: {
  elements: WhiteboardElement[]
  viewport: WhiteboardViewport | undefined
}): string {
  return JSON.stringify({
    elements: input.elements,
    viewport: input.viewport ?? null,
  })
}

function describeProgramValue(value: unknown): string {
  if (!isRecord(value)) return "non-object"
  const type = typeof value.type === "string" ? value.type : "missing-type"
  const id = typeof value.id === "string" ? value.id : "missing-id"
  return `${type}:${id}`
}

function readProgramWriteMode(input: {
  program: unknown[]
  warnings: string[]
}): WhiteboardProgramWriteMode {
  let hasRestore = false
  let hasReplacement = false
  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    const type = readElementType(value)
    if (type === "replaceCurrentBoard") {
      const parsed = ReplaceCurrentBoardSchema.safeParse(value)
      if (!parsed.success) {
        throw new WhiteboardElementValidationError(
          `Invalid replaceCurrentBoard at index ${index}: expected {"type":"replaceCurrentBoard"}.`,
        )
      }
      if (index !== 0) {
        throw new WhiteboardElementValidationError(
          `Invalid replaceCurrentBoard at index ${index}: replacement must be the first whiteboard program item.`,
        )
      }
      hasReplacement = true
      continue
    }
    if (type === "restoreCheckpoint") {
      const parsed = RestoreCheckpointSchema.safeParse(value)
      if (!parsed.success) {
        throw new WhiteboardElementValidationError(
          `Invalid restoreCheckpoint at index ${index}: expected {"type":"restoreCheckpoint","id":"${WHITEBOARD_CONTINUATION_HANDLE}"}.`,
        )
      }
      if (parsed.data.id !== WHITEBOARD_CONTINUATION_HANDLE) {
        throw new WhiteboardElementValidationError(
          `Invalid restoreCheckpoint at index ${index}: expected id "${WHITEBOARD_CONTINUATION_HANDLE}", got "${parsed.data.id}".`,
        )
      }
      if (index !== 0) {
        input.warnings.push(
          `restoreCheckpoint appeared at index ${index}; applied it as the current-board continuation anyway.`,
        )
      }
      hasRestore = true
    }
  }
  if (hasRestore && hasReplacement) {
    throw new WhiteboardElementValidationError(
      "Invalid whiteboard program: use either restoreCheckpoint to continue or replaceCurrentBoard to discard the current board, not both.",
    )
  }
  if (hasReplacement) return "replace"
  if (hasRestore) return "continue"
  return "auto"
}

function resolveProgramWriteMode(input: {
  program: unknown[]
  requestedWriteMode?: WhiteboardProgramRequestedWriteMode
  warnings: string[]
}): WhiteboardProgramWriteMode {
  const embeddedWriteMode = readProgramWriteMode({
    program: input.program,
    warnings: input.warnings,
  })
  if (!input.requestedWriteMode) return embeddedWriteMode
  if (embeddedWriteMode === "auto") return input.requestedWriteMode
  if (embeddedWriteMode !== input.requestedWriteMode) {
    throw new WhiteboardElementValidationError(
      "Invalid whiteboard program: boardAction conflicts with restoreCheckpoint/replaceCurrentBoard inside elements. Use boardAction for the board write mode and keep board-action markers out of elements.",
    )
  }
  input.warnings.push(
    "Ignored deprecated restoreCheckpoint/replaceCurrentBoard marker inside elements because boardAction now controls whether the board continues or replaces. Remove board-action markers from elements.",
  )
  return input.requestedWriteMode
}

function applyDeletion(input: {
  elements: WhiteboardElement[]
  value: unknown
  index: number
  warnings: string[]
}): WhiteboardElement[] {
  const deletion = DeleteElementSchema.safeParse(input.value)
  if (!deletion.success) {
    input.warnings.push(
      `Skipped malformed delete at index ${input.index}: ${deletion.error.message}`,
    )
    return input.elements
  }
  const ids = parseDeleteIDs(deletion.data)
  if (!ids) {
    input.warnings.push(`Skipped delete at index ${input.index}: no element ids were provided.`)
    return input.elements
  }
  return withoutDeletedElements(input.elements, new Set(ids))
}

function translateElements(input: {
  elements: WhiteboardElement[]
  ids: Set<string>
  dx: number
  dy: number
}): WhiteboardElement[] {
  const expandedIDs = new Set(input.ids)
  for (const element of input.elements) {
    if (typeof element.containerId === "string" && input.ids.has(element.containerId)) {
      expandedIDs.add(element.id)
    }
  }
  return input.elements.map((element) => {
    if (!expandedIDs.has(element.id)) return element
    if (typeof element.x !== "number" || typeof element.y !== "number") return element
    return {
      ...element,
      x: element.x + input.dx,
      y: element.y + input.dy,
    }
  })
}

function applyTranslation(input: {
  elements: WhiteboardElement[]
  value: unknown
  index: number
  warnings: string[]
}): WhiteboardElement[] {
  const translation = TranslateElementsSchema.safeParse(input.value)
  if (!translation.success) {
    input.warnings.push(
      `Skipped malformed translate at index ${input.index}: ${translation.error.message}`,
    )
    return input.elements
  }
  const ids = parseCommaSeparatedIDs(translation.data.ids)
  if (!ids) {
    input.warnings.push(`Skipped translate at index ${input.index}: no element ids were provided.`)
    return input.elements
  }
  if (translation.data.dx === 0 && translation.data.dy === 0) {
    input.warnings.push(`Skipped translate at index ${input.index}: dx and dy were both zero.`)
    return input.elements
  }
  const existingIDs = new Set(input.elements.map((element) => element.id))
  const matchedIDs = ids.filter((id) => existingIDs.has(id))
  if (matchedIDs.length === 0) {
    input.warnings.push(
      `Skipped translate at index ${input.index}: none of the requested element ids exist.`,
    )
    return input.elements
  }
  const missingIDs = ids.filter((id) => !existingIDs.has(id))
  if (missingIDs.length > 0) {
    input.warnings.push(
      `Translated existing elements at index ${input.index}, but skipped missing ids: ${missingIDs.join(", ")}.`,
    )
  }
  return translateElements({
    elements: input.elements,
    ids: new Set(matchedIDs),
    dx: translation.data.dx,
    dy: translation.data.dy,
  })
}

function appendCameraRatioHint(input: { camera: WhiteboardViewport; warnings: string[] }) {
  const ratio = input.camera.width / input.camera.height
  if (Math.abs(ratio - CAMERA_TARGET_ASPECT_RATIO) <= CAMERA_ASPECT_RATIO_TOLERANCE) return
  input.warnings.push(
    `Tip: your cameraUpdate used ${input.camera.width}x${input.camera.height}; try to stick with 4:3 aspect ratio, for example 400x300 or 800x600.`,
  )
}

function applyCameraUpdate(input: {
  value: unknown
  index: number
  viewport: WhiteboardViewport | undefined
  warnings: string[]
}): WhiteboardViewport | undefined {
  const camera = CameraUpdateSchema.safeParse(input.value)
  if (!camera.success) {
    input.warnings.push(
      `Skipped malformed cameraUpdate at index ${input.index}: ${camera.error.message}`,
    )
    return input.viewport
  }
  const viewport = WhiteboardViewportSchema.parse({
    x: camera.data.x,
    y: camera.data.y,
    width: camera.data.width,
    height: camera.data.height,
  })
  appendCameraRatioHint({ camera: viewport, warnings: input.warnings })
  return viewport
}

function parseDrawableElement(input: {
  value: unknown
  index: number
  warnings: string[]
}): WhiteboardElement | undefined {
  try {
    return parsePersistableWhiteboardElement(input.value, input.index)
  } catch (error) {
    if (error instanceof WhiteboardElementValidationError || error instanceof z.ZodError) {
      input.warnings.push(
        `Skipped invalid whiteboard element at index ${input.index} (${describeProgramValue(input.value)}): ${error.message}`,
      )
      return undefined
    }
    throw error
  }
}

function buildWhiteboardProgramBoard(input: {
  program: unknown[]
  base: WhiteboardProgramBase
  continueCurrent: boolean
  warnings: string[]
}) {
  let elements = input.continueCurrent ? input.base.elements.map((element) => ({ ...element })) : []
  let viewport = input.continueCurrent ? input.base.viewport : undefined
  const initialSignature = buildProgramStateSignature({ elements, viewport })

  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    const type = readElementType(value)
    if (type === undefined) {
      input.warnings.push(
        `Skipped whiteboard program item at index ${index}: element must be an object with a non-empty string type.`,
      )
      continue
    }
    if (type === "restoreCheckpoint") {
      continue
    }
    if (type === "replaceCurrentBoard") {
      continue
    }
    if (type === "delete") {
      elements = applyDeletion({ elements, value, index, warnings: input.warnings })
      continue
    }
    if (type === "translate") {
      elements = applyTranslation({ elements, value, index, warnings: input.warnings })
      continue
    }
    if (type === "cameraUpdate") {
      viewport = applyCameraUpdate({
        value,
        index,
        viewport,
        warnings: input.warnings,
      })
      continue
    }
    if (PSEUDO_ELEMENT_TYPES.has(type)) {
      input.warnings.push(
        `Skipped unsupported whiteboard pseudo-element type '${type}' at index ${index}.`,
      )
      continue
    }
    const element = parseDrawableElement({ value, index, warnings: input.warnings })
    if (!element) continue
    if (elements.some((existing) => existing.id === element.id)) {
      input.warnings.push(
        `Skipped duplicate live whiteboard element id '${element.id}' at index ${index}. Delete the existing element before adding a replacement.`,
      )
      continue
    }
    elements.push(element)
  }
  if (elements.length === 0 && !(input.continueCurrent && input.base.hasCurrentBoard)) {
    throw new Error(
      "Whiteboard program did not contain any valid drawable elements, so no board was saved.",
    )
  }
  if (buildProgramStateSignature({ elements, viewport }) === initialSignature) {
    throw new Error("Whiteboard program did not make any valid changes, so no board was saved.")
  }

  return {
    elements,
    ...(viewport ? { viewport } : {}),
  }
}

async function applyWhiteboardDrawingProgram(input: {
  directory: string
  objectID: string
  title?: string
  elements: string
  writeMode?: WhiteboardProgramRequestedWriteMode
}): Promise<WhiteboardProgramResult> {
  const program = parseDrawingProgram(input.elements)
  const warnings: string[] = []
  const writeMode = resolveProgramWriteMode({
    program,
    requestedWriteMode: input.writeMode,
    warnings,
  })
  const layoutPriorityElementIDs = collectLayoutPriorityElementIDs(program)
  const touchedIDs = writeMode === "replace" ? new Set<string>() : collectTouchedIDs(program)
  const writeResult = await writeWhiteboardCurrentFromLatest({
    directory: input.directory,
    objectID: input.objectID,
    ...(input.title ? { title: input.title } : {}),
    origin: "agent" satisfies WhiteboardBoardOrigin,
    validateBase:
      writeMode === "replace"
        ? undefined
        : (latestBase) => {
            const continueCurrent = writeMode === "continue" || latestBase.hasCurrentBoard
            if (!continueCurrent) return
            assertWhiteboardTouchedAnchorsFresh({
              currentBoard: latestBase.currentBoard,
              modelContext: latestBase.modelContext,
              touchedIDs,
            })
          },
    buildBoard: (latestBase) => {
      const continueCurrent =
        writeMode === "continue" || (writeMode === "auto" && latestBase.hasCurrentBoard)
      return buildWhiteboardProgramBoard({
        program,
        base: {
          elements: latestBase.elements,
          hasCurrentBoard: latestBase.hasCurrentBoard,
          ...(latestBase.viewport ? { viewport: latestBase.viewport } : {}),
        },
        continueCurrent,
        warnings,
      })
    },
    recordModelContext: true,
  })
  const state = writeResult.state
  const currentBoard: WhiteboardBoard | null = state.currentBoard
  if (!currentBoard) {
    throw new Error("Whiteboard program did not create a current board.")
  }
  return {
    state,
    continuationHandle: WHITEBOARD_CONTINUATION_HANDLE,
    boardID: currentBoard.boardID,
    saved: writeResult.saved,
    warnings,
    layoutPriorityElementIDs: [...layoutPriorityElementIDs],
  }
}

export { applyWhiteboardDrawingProgram, parseDrawingProgram }
export type { WhiteboardProgramRequestedWriteMode, WhiteboardProgramResult }
