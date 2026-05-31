import z from "zod"
import { appendWhiteboardRevisionFromLatest } from "./store"
import { WhiteboardElementValidationError } from "../errors"
import {
  WhiteboardViewportSchema,
  parsePersistableWhiteboardElement,
  type WhiteboardElement,
  type WhiteboardSessionRead,
  type WhiteboardViewport,
} from "./types"
import { assertWhiteboardPayloadWithinLimit } from "./payload"
import {
  countWhiteboardHardLayoutWarnings,
  detectWhiteboardLayoutWarnings,
  findWhiteboardRedrawZoneOutsideElementIDs,
  readWhiteboardLayoutZoneScope,
  type WhiteboardLayoutZoneScope,
  type WhiteboardLayoutWarnings,
} from "./layout-warnings"

const PSEUDO_ELEMENT_TYPES = new Set([
  "restoreCheckpoint",
  "delete",
  "cameraUpdate",
  "update",
  "translate",
  "layoutCleanup",
])

const RestoreCheckpointSchema = z
  .object({
    type: z.literal("restoreCheckpoint"),
    id: z.string().trim().min(1),
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

const UpdateElementSchema = z
  .object({
    type: z.literal("update"),
    id: z.string().trim().min(1),
  })
  .loose()

const TranslateElementsSchema = z
  .object({
    type: z.literal("translate"),
    ids: z.string().trim().min(1),
    dx: z.number().finite(),
    dy: z.number().finite(),
  })
  .strict()

const LAYOUT_CLEANUP_STRATEGIES = [
  "spread_zone",
  "move_isolated",
  "split_sections",
  "simplify_labels",
  "redraw_zone",
] as const

const LayoutCleanupSchema = z
  .object({
    type: z.literal("layoutCleanup"),
    strategy: z.enum(LAYOUT_CLEANUP_STRATEGIES),
    zoneId: z.string().trim().min(1).optional(),
  })
  .strict()

const CAMERA_TARGET_ASPECT_RATIO = 4 / 3
const CAMERA_ASPECT_RATIO_TOLERANCE = 0.15

type WhiteboardLayoutCleanupStrategy = z.infer<typeof LayoutCleanupSchema>["strategy"]
type WhiteboardLayoutCleanupReview = {
  strategy: WhiteboardLayoutCleanupStrategy
  zoneId?: string
  accepted: boolean
  hardBefore: number
  hardAfter: number
}

type WhiteboardProgramResult = {
  state: WhiteboardSessionRead
  sceneID: string
  revisionID: string
  saved: boolean
  warnings: string[]
  layoutWarnings?: WhiteboardLayoutWarnings
  layoutCleanup?: WhiteboardLayoutCleanupReview
}

type WhiteboardProgramBase = {
  sceneID?: string
  elements: WhiteboardElement[]
  viewport?: WhiteboardViewport
}

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

function findRestoreCheckpoint(input: {
  program: unknown[]
  warnings: string[]
}): { sceneID: string; index: number } | undefined {
  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    if (readElementType(value) !== "restoreCheckpoint") continue
    const parsed = RestoreCheckpointSchema.safeParse(value)
    if (!parsed.success) {
      input.warnings.push(
        `Skipped malformed restoreCheckpoint at index ${index}: ${parsed.error.message}`,
      )
      continue
    }
    if (index !== 0) {
      input.warnings.push(
        `restoreCheckpoint appeared at index ${index}; applied it as the scene continuation anyway.`,
      )
    }
    return {
      sceneID: parsed.data.id,
      index,
    }
  }
  return undefined
}

function resolveProgramBase(input: {
  program: unknown[]
  warnings: string[]
}): { sceneID?: string } {
  const restore = findRestoreCheckpoint({
    program: input.program,
    warnings: input.warnings,
  })
  if (restore) {
    return { sceneID: restore.sceneID }
  }
  return {}
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

function applyUpdate(input: {
  elements: WhiteboardElement[]
  value: unknown
  index: number
  warnings: string[]
}): WhiteboardElement[] {
  const update = UpdateElementSchema.safeParse(input.value)
  if (!update.success) {
    input.warnings.push(
      `Skipped malformed update at index ${input.index}: ${update.error.message}`,
    )
    return input.elements
  }
  const elementIndex = input.elements.findIndex((element) => element.id === update.data.id)
  if (elementIndex === -1) {
    input.warnings.push(
      `Skipped update at index ${input.index}: element '${update.data.id}' does not exist.`,
    )
    return input.elements
  }
  const patch = Object.fromEntries(
    Object.entries(update.data).filter(([key]) => key !== "type" && key !== "id"),
  )
  if (Object.keys(patch).length === 0) {
    input.warnings.push(`Skipped update at index ${input.index}: no patch fields were provided.`)
    return input.elements
  }
  const existing = input.elements[elementIndex]
  const updated = parseDrawableElement({
    value: {
      ...existing,
      ...patch,
      id: existing.id,
      type: existing.type,
    },
    index: input.index,
    warnings: input.warnings,
  })
  if (!updated) return input.elements
  const nextElements = input.elements.with(elementIndex, updated)
  if (
    typeof existing.x !== "number" ||
    typeof existing.y !== "number" ||
    typeof updated.x !== "number" ||
    typeof updated.y !== "number"
  ) {
    return nextElements
  }
  return translateBoundTextChildren({
    elements: nextElements,
    containerIDs: new Set([updated.id]),
    dx: updated.x - existing.x,
    dy: updated.y - existing.y,
  })
}

function translateBoundTextChildren(input: {
  elements: WhiteboardElement[]
  containerIDs: Set<string>
  dx: number
  dy: number
}): WhiteboardElement[] {
  if (input.dx === 0 && input.dy === 0) return input.elements
  return input.elements.map((element) => {
    if (
      typeof element.containerId !== "string" ||
      !input.containerIDs.has(element.containerId) ||
      typeof element.x !== "number" ||
      typeof element.y !== "number"
    ) {
      return element
    }
    return {
      ...element,
      x: element.x + input.dx,
      y: element.y + input.dy,
    }
  })
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

function findLayoutCleanup(input: {
  program: unknown[]
  warnings: string[]
}): { strategy: WhiteboardLayoutCleanupStrategy; zoneId?: string } | undefined {
  let cleanup: { strategy: WhiteboardLayoutCleanupStrategy; zoneId?: string } | undefined
  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    if (readElementType(value) !== "layoutCleanup") continue
    const parsed = LayoutCleanupSchema.safeParse(value)
    if (!parsed.success) {
      input.warnings.push(`Skipped malformed layoutCleanup at index ${index}: ${parsed.error.message}`)
      continue
    }
    if (cleanup) {
      input.warnings.push(`Skipped duplicate layoutCleanup at index ${index}.`)
      continue
    }
    if (parsed.data.strategy === "redraw_zone" && !parsed.data.zoneId) {
      input.warnings.push(`Skipped redraw_zone layoutCleanup at index ${index}: zoneId is required.`)
      continue
    }
    cleanup = {
      strategy: parsed.data.strategy,
      ...(parsed.data.zoneId ? { zoneId: parsed.data.zoneId } : {}),
    }
  }
  return cleanup
}

function assertValidLayoutCleanupProgram(input: {
  program: unknown[]
  cleanup: { strategy: WhiteboardLayoutCleanupStrategy; zoneId?: string }
}): void {
  if (input.cleanup.strategy !== "redraw_zone") return
  const hasPositionalRepair = input.program.some((value) => {
    const type = readElementType(value)
    return type === "update" || type === "translate"
  })
  if (hasPositionalRepair) {
    throw new Error(
      "redraw_zone layoutCleanup must delete and recreate the crowded zone; do not use update or translate.",
    )
  }
  const deletedIDs = readProgramDeletedIDs(input.program)
  if (!input.cleanup.zoneId || !deletedIDs.has(input.cleanup.zoneId)) {
    throw new Error("redraw_zone layoutCleanup must delete its targeted zoneId before recreating it.")
  }
}

function readProgramDeletedIDs(program: unknown[]): Set<string> {
  const deletedIDs = new Set<string>()
  for (const value of program) {
    if (readElementType(value) !== "delete") continue
    const deletion = DeleteElementSchema.safeParse(value)
    if (!deletion.success) continue
    for (const id of parseDeleteIDs(deletion.data) ?? []) {
      deletedIDs.add(id)
    }
  }
  return deletedIDs
}

function assertValidRedrawZoneScope(input: {
  elements: WhiteboardElement[]
  program: unknown[]
  cleanup: { strategy: WhiteboardLayoutCleanupStrategy; zoneId?: string }
}): WhiteboardLayoutZoneScope | undefined {
  if (input.cleanup.strategy !== "redraw_zone") return undefined
  if (!input.cleanup.zoneId) {
    throw new Error("redraw_zone layoutCleanup requires a targeted zoneId.")
  }
  const scope = readWhiteboardLayoutZoneScope(input.elements, input.cleanup.zoneId)
  if (!scope) {
    throw new Error(
      `redraw_zone layoutCleanup targeted zone '${input.cleanup.zoneId}' does not exist.`,
    )
  }
  const allowedIDs = new Set(scope.elementIDs)
  const deletedIDs = readProgramDeletedIDs(input.program)
  const outsideIDs = [...deletedIDs].filter((id) => !allowedIDs.has(id))
  if (outsideIDs.length > 0) {
    throw new Error(
      `redraw_zone layoutCleanup must keep elements outside its targeted zone unchanged. Outside deletions: ${outsideIDs.join(", ")}.`,
    )
  }
  const missingIDs = scope.elementIDs.filter((id) => !deletedIDs.has(id))
  if (missingIDs.length > 0) {
    throw new Error(
      `redraw_zone layoutCleanup must delete exactly its targeted zone ids before recreating them. Missing deletions: ${missingIDs.join(", ")}.`,
    )
  }
  return scope
}

function appendCameraRatioHint(input: {
  camera: WhiteboardViewport
  warnings: string[]
}) {
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

function buildWhiteboardProgramRevision(input: {
  program: unknown[]
  base: WhiteboardProgramBase
  warnings: string[]
}): { elements: WhiteboardElement[]; viewport?: WhiteboardViewport } {
  let elements = input.base.elements.map((element) => ({ ...element }))
  let viewport = input.base.viewport
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
    if (type === "delete") {
      elements = applyDeletion({ elements, value, index, warnings: input.warnings })
      continue
    }
    if (type === "update") {
      elements = applyUpdate({ elements, value, index, warnings: input.warnings })
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
    if (type === "layoutCleanup") {
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
  if (elements.length === 0 && !input.base.sceneID) {
    throw new Error(
      "Whiteboard program did not contain any valid drawable elements, so no revision was saved.",
    )
  }
  if (buildProgramStateSignature({ elements, viewport }) === initialSignature) {
    throw new Error("Whiteboard program did not make any valid changes, so no revision was saved.")
  }

  return {
    elements,
    ...(viewport ? { viewport } : {}),
  }
}

async function applyWhiteboardDrawingProgram(input: {
  directory: string
  sessionID: string
  elements: string
}): Promise<WhiteboardProgramResult> {
  const program = parseDrawingProgram(input.elements)
  const warnings: string[] = []
  const base = resolveProgramBase({
    program,
    warnings,
  })
  const layoutCleanup = findLayoutCleanup({
    program,
    warnings,
  })
  if (layoutCleanup) {
    assertValidLayoutCleanupProgram({
      program,
      cleanup: layoutCleanup,
    })
  }
  if (layoutCleanup && !base.sceneID) {
    throw new Error("layoutCleanup requires restoreCheckpoint so the prior whiteboard head is preserved.")
  }
  let layoutCleanupReview: WhiteboardLayoutCleanupReview | undefined
  let redrawZoneScope: WhiteboardLayoutZoneScope | undefined
  const appendResult = await appendWhiteboardRevisionFromLatest({
    directory: input.directory,
    sessionID: input.sessionID,
    ...(base.sceneID ? { sceneID: base.sceneID } : {}),
    origin: "agent",
    buildRevision: (latestBase) => {
      if (layoutCleanup) {
        redrawZoneScope = assertValidRedrawZoneScope({
          elements: latestBase.elements,
          program,
          cleanup: layoutCleanup,
        })
      }
      return buildWhiteboardProgramRevision({
        program,
        base: {
          ...(base.sceneID ? { sceneID: base.sceneID } : {}),
          elements: latestBase.elements,
          ...(latestBase.viewport ? { viewport: latestBase.viewport } : {}),
        },
        warnings,
      })
    },
    ...(layoutCleanup
      ? {
          shouldAppend: ({
            base: latestBase,
            next,
          }) => {
            if (layoutCleanup.strategy === "redraw_zone") {
              if (!redrawZoneScope) {
                throw new Error("redraw_zone layoutCleanup could not resolve its targeted zone.")
              }
              const outsideIDs = findWhiteboardRedrawZoneOutsideElementIDs({
                baseElements: latestBase.elements,
                nextElements: next.elements,
                scope: redrawZoneScope,
              })
              if (outsideIDs.length > 0) {
                throw new Error(
                  `redraw_zone layoutCleanup must recreate only its targeted zone. New elements outside its bounded expansion: ${outsideIDs.join(", ")}.`,
                )
              }
            }
            const hardBefore = countWhiteboardHardLayoutWarnings(latestBase.elements)
            const hardAfter = countWhiteboardHardLayoutWarnings(next.elements)
            const requiredReduction =
              layoutCleanup.strategy === "redraw_zone"
                ? Math.max(2, Math.ceil(hardBefore * 0.3))
                : 1
            const accepted = hardBefore - hardAfter >= requiredReduction
            layoutCleanupReview = {
              strategy: layoutCleanup.strategy,
              ...(layoutCleanup.zoneId ? { zoneId: layoutCleanup.zoneId } : {}),
              accepted,
              hardBefore,
              hardAfter,
            }
            return accepted
          },
        }
      : {}),
  })
  const state = appendResult.state
  const activeScene = state.activeScene
  if (!activeScene) {
    throw new Error("Whiteboard program did not create an active scene.")
  }
  const layoutWarnings = detectWhiteboardLayoutWarnings(activeScene.latestRevision.elements, {
    cleanupAttempted: layoutCleanup !== undefined,
  })
  return {
    state,
    sceneID: activeScene.sceneID,
    revisionID: activeScene.headRevisionID,
    saved: appendResult.appended,
    warnings,
    ...(layoutWarnings ? { layoutWarnings } : {}),
    ...(layoutCleanupReview ? { layoutCleanup: layoutCleanupReview } : {}),
  }
}

export { applyWhiteboardDrawingProgram, parseDrawingProgram }
export type { WhiteboardProgramResult }
