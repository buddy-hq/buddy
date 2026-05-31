import type { MessageWithParts } from "@/state/chat-types"
import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"

type ProgressiveWhiteboardPreview = {
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
  signature: string
}

type ProgressiveWhiteboardState = {
  sceneID?: string
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
}

type ProgramReadMode = "complete" | "streaming"
const STREAMING_CONTROL_TYPES = new Set([
  "restoreCheckpoint",
  "delete",
  "update",
  "translate",
  "layoutCleanup",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function decodeJsonEscape(value: string): string | undefined {
  switch (value) {
    case '"':
    case "\\":
    case "/":
      return value
    case "b":
      return "\b"
    case "f":
      return "\f"
    case "n":
      return "\n"
    case "r":
      return "\r"
    case "t":
      return "\t"
    default:
      return undefined
  }
}

function decodePartialElementsArgument(raw: string): string | undefined {
  const keyIndex = raw.indexOf('"elements"')
  if (keyIndex === -1) return undefined
  const colonIndex = raw.indexOf(":", keyIndex + '"elements"'.length)
  if (colonIndex === -1) return undefined
  const quoteIndex = raw.indexOf('"', colonIndex + 1)
  if (quoteIndex === -1) return undefined

  let decoded = ""
  for (let index = quoteIndex + 1; index < raw.length; index += 1) {
    const character = raw[index]
    if (character === '"') return decoded
    if (character !== "\\") {
      decoded += character
      continue
    }

    const escaped = raw[index + 1]
    if (!escaped) return decoded
    if (escaped === "u") {
      const codePoint = raw.slice(index + 2, index + 6)
      if (!/^[a-f0-9]{4}$/iu.test(codePoint)) return decoded
      decoded += String.fromCharCode(Number.parseInt(codePoint, 16))
      index += 5
      continue
    }
    const value = decodeJsonEscape(escaped)
    if (value === undefined) return decoded
    decoded += value
    index += 1
  }
  return decoded
}

function readJsonArray(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function parsePartialElements(value: string | undefined): unknown[] {
  if (!value?.trim().startsWith("[")) return []
  const complete = readJsonArray(value)
  if (complete) return complete
  const lastCompleteObject = value.lastIndexOf("}")
  if (lastCompleteObject === -1) return []
  return readJsonArray(`${value.slice(0, lastCompleteObject + 1)}]`) ?? []
}

function excludeNewestPartialItem(elements: unknown[]): unknown[] {
  return elements.length <= 1 ? [] : elements.slice(0, -1)
}

function includeCompleteStreamingControls(input: {
  parsed: unknown[]
  safe: unknown[]
}): unknown[] {
  const safeControlCount = new Map<string, number>()
  for (const value of input.safe) {
    if (!isRecord(value) || typeof value.type !== "string") continue
    if (!STREAMING_CONTROL_TYPES.has(value.type)) continue
    safeControlCount.set(value.type, (safeControlCount.get(value.type) ?? 0) + 1)
  }

  const output = [...input.safe]
  for (const value of input.parsed) {
    if (!isRecord(value) || typeof value.type !== "string") continue
    if (!STREAMING_CONTROL_TYPES.has(value.type)) continue
    const remaining = safeControlCount.get(value.type) ?? 0
    if (remaining > 0) {
      safeControlCount.set(value.type, remaining - 1)
      continue
    }
    output.push(value)
  }
  return output
}

function readStreamingProgram(elements: string | undefined): unknown[] {
  const parsed = parsePartialElements(elements)
  return includeCompleteStreamingControls({
    parsed,
    safe: excludeNewestPartialItem(parsed),
  })
}

function readProgramFromElementsString(
  elements: string | undefined,
  mode: ProgramReadMode,
): unknown[] {
  if (mode === "streaming") return readStreamingProgram(elements)
  return elements ? (readJsonArray(elements) ?? []) : []
}

function readProgramFromRaw(raw: string | undefined, mode: ProgramReadMode): unknown[] {
  return readProgramFromElementsString(
    raw ? decodePartialElementsArgument(raw) : undefined,
    mode,
  )
}

function isPersistedElement(value: unknown): value is PersistedWhiteboardElement {
  return isRecord(value) && typeof value.id === "string" && typeof value.type === "string"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function deleteElements(
  elements: PersistedWhiteboardElement[],
  ids: Set<string>,
): PersistedWhiteboardElement[] {
  return elements.filter((element) => {
    if (ids.has(element.id)) return false
    return typeof element.containerId !== "string" || !ids.has(element.containerId)
  })
}

function parseDeleteIDs(value: unknown): Set<string> {
  if (!isRecord(value)) return new Set()
  const raw = typeof value.ids === "string" ? value.ids : value.id
  if (typeof raw !== "string") return new Set()
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

function updateElement(
  elements: PersistedWhiteboardElement[],
  value: Record<string, unknown>,
): PersistedWhiteboardElement[] {
  if (typeof value.id !== "string") return elements
  const elementIndex = elements.findIndex((element) => element.id === value.id)
  if (elementIndex === -1) return elements
  const existing = elements[elementIndex]
  const patch = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "type" && key !== "id"),
  )
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    type: existing.type,
  }
  const nextElements = elements.with(elementIndex, updated)
  const updatedX = patch.x ?? existing.x
  const updatedY = patch.y ?? existing.y
  if (
    !isFiniteNumber(existing.x) ||
    !isFiniteNumber(existing.y) ||
    !isFiniteNumber(updatedX) ||
    !isFiniteNumber(updatedY)
  ) {
    return nextElements
  }
  return translateBoundTextChildren({
    elements: nextElements,
    containerIDs: new Set([updated.id]),
    dx: updatedX - existing.x,
    dy: updatedY - existing.y,
  })
}

function translateBoundTextChildren(input: {
  elements: PersistedWhiteboardElement[]
  containerIDs: Set<string>
  dx: number
  dy: number
}): PersistedWhiteboardElement[] {
  if (input.dx === 0 && input.dy === 0) return input.elements
  return input.elements.map((element) => {
    if (
      typeof element.containerId !== "string" ||
      !input.containerIDs.has(element.containerId) ||
      !isFiniteNumber(element.x) ||
      !isFiniteNumber(element.y)
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

function translateElements(
  elements: PersistedWhiteboardElement[],
  value: Record<string, unknown>,
): PersistedWhiteboardElement[] {
  if (typeof value.ids !== "string" || !isFiniteNumber(value.dx) || !isFiniteNumber(value.dy)) {
    return elements
  }
  const dx = value.dx
  const dy = value.dy
  const ids = new Set(
    value.ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  for (const element of elements) {
    if (typeof element.containerId === "string" && ids.has(element.containerId)) {
      ids.add(element.id)
    }
  }
  return elements.map((element) => {
    if (!ids.has(element.id) || !isFiniteNumber(element.x) || !isFiniteNumber(element.y)) {
      return element
    }
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy,
    }
  })
}

function parseCameraViewport(value: unknown): WhiteboardViewport | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    return undefined
  }
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  }
}

function readElementSignature(element: PersistedWhiteboardElement): string {
  return JSON.stringify(element)
}

function buildPreviewSignature(input: {
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
}) {
  const viewport = input.viewport
    ? `${input.viewport.x}:${input.viewport.y}:${input.viewport.width}:${input.viewport.height}`
    : ""
  return `${viewport}|${input.elements.map(readElementSignature).join("|")}`
}

function toPreview(state: ProgressiveWhiteboardState): ProgressiveWhiteboardPreview {
  return {
    elements: state.elements,
    ...(state.viewport ? { viewport: state.viewport } : {}),
    signature: buildPreviewSignature({
      elements: state.elements,
      ...(state.viewport ? { viewport: state.viewport } : {}),
    }),
  }
}

function readRestoreSceneID(program: unknown[]): string | undefined {
  for (const value of program) {
    if (!isRecord(value) || value.type !== "restoreCheckpoint" || typeof value.id !== "string") {
      continue
    }
    return value.id
  }
  return undefined
}

function applyProgressiveProgram(input: {
  current: ProgressiveWhiteboardState
  program: unknown[]
  completedSceneID?: string
}): ProgressiveWhiteboardState {
  const restoreSceneID = readRestoreSceneID(input.program)
  const continuesCurrentScene =
    restoreSceneID !== undefined && restoreSceneID === input.current.sceneID
  let elements = continuesCurrentScene ? [...input.current.elements] : []
  let viewport = continuesCurrentScene ? input.current.viewport : undefined
  const sceneID = input.completedSceneID ?? restoreSceneID

  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    if (!isRecord(value) || typeof value.type !== "string") continue
    if (value.type === "restoreCheckpoint") continue
    if (value.type === "cameraUpdate") {
      viewport = parseCameraViewport(value) ?? viewport
      continue
    }
    if (value.type === "delete") {
      elements = deleteElements(elements, parseDeleteIDs(value))
      continue
    }
    if (value.type === "update") {
      elements = updateElement(elements, value)
      continue
    }
    if (value.type === "translate") {
      elements = translateElements(elements, value)
      continue
    }
    if (value.type === "layoutCleanup") continue
    if (!isPersistedElement(value)) continue
    if (elements.some((element) => element.id === value.id)) continue
    elements.push(value)
  }
  return {
    elements,
    ...(sceneID ? { sceneID } : {}),
    ...(viewport ? { viewport } : {}),
  }
}

function buildProgressiveWhiteboardPreview(input: {
  raw: string | undefined
  activeSceneID?: string
  baseElements: PersistedWhiteboardElement[]
}): ProgressiveWhiteboardPreview | undefined {
  const program = readProgramFromRaw(input.raw, "streaming")
  if (program.length === 0) return undefined
  return toPreview(
    applyProgressiveProgram({
      current: {
        elements: [...input.baseElements],
        ...(input.activeSceneID ? { sceneID: input.activeSceneID } : {}),
      },
      program,
    }),
  )
}

function buildProgressiveWhiteboardElements(input: {
  raw: string | undefined
  activeSceneID?: string
  baseElements: PersistedWhiteboardElement[]
}): PersistedWhiteboardElement[] | undefined {
  return buildProgressiveWhiteboardPreview(input)?.elements
}

function readToolInputElements(state: Record<string, unknown>): string | undefined {
  if (!isRecord(state.input)) return undefined
  return typeof state.input.elements === "string" ? state.input.elements : undefined
}

function readToolMetadataString(state: Record<string, unknown>, key: string): string | undefined {
  if (!isRecord(state.metadata)) return undefined
  return typeof state.metadata[key] === "string" ? state.metadata[key] : undefined
}

function readToolMetadataBoolean(state: Record<string, unknown>, key: string): boolean | undefined {
  if (!isRecord(state.metadata)) return undefined
  return typeof state.metadata[key] === "boolean" ? state.metadata[key] : undefined
}

function didCompletedWhiteboardCreateSave(state: Record<string, unknown>): boolean {
  return readToolMetadataBoolean(state, "saved") !== false
}

function shouldApplyCompletedWhiteboardCreate(input: {
  revisionID: string | undefined
  baseRevisionID: string | undefined
}): boolean {
  if (input.baseRevisionID === undefined) return true
  return input.revisionID !== undefined && input.revisionID > input.baseRevisionID
}

function buildProgressiveWhiteboardPreviewFromMessages(input: {
  messages: MessageWithParts[]
  activeSceneID?: string
  baseRevisionID?: string
  baseElements: PersistedWhiteboardElement[]
  baseViewport?: WhiteboardViewport
}): ProgressiveWhiteboardPreview | undefined {
  let state: ProgressiveWhiteboardState = {
    elements: [...input.baseElements],
    ...(input.activeSceneID ? { sceneID: input.activeSceneID } : {}),
    ...(input.baseViewport ? { viewport: input.baseViewport } : {}),
  }
  let appliedProgram = false
  let hasStreamingTool = false

  for (const message of input.messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue

      if (part.state.status === "completed") {
        if (!didCompletedWhiteboardCreateSave(part.state)) continue
        const revisionID = readToolMetadataString(part.state, "revisionID")
        if (
          !shouldApplyCompletedWhiteboardCreate({
            revisionID,
            baseRevisionID: input.baseRevisionID,
          })
        ) {
          continue
        }
        const program = readProgramFromElementsString(readToolInputElements(part.state), "complete")
        if (program.length === 0) continue
        state = applyProgressiveProgram({
          current: state,
          program,
          ...(readToolMetadataString(part.state, "sceneID")
            ? { completedSceneID: readToolMetadataString(part.state, "sceneID") }
            : {}),
        })
        appliedProgram = true
        continue
      }

      if (part.state.status !== "pending" && part.state.status !== "running") continue
      hasStreamingTool = true
      const program = readProgramFromRaw(
        typeof part.state.raw === "string" ? part.state.raw : undefined,
        "streaming",
      )
      if (program.length === 0) continue
      state = applyProgressiveProgram({ current: state, program })
      appliedProgram = true
    }
  }

  if (!appliedProgram) return undefined
  if (!hasStreamingTool && input.baseRevisionID !== undefined) return undefined
  return toPreview(state)
}

function hasActiveWhiteboardCreate(messages: MessageWithParts[]): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") return false
      if (!isRecord(part.state)) return false
      return part.state.status === "pending" || part.state.status === "running"
    }),
  )
}

function hasUnfetchedCompletedWhiteboardCreate(input: {
  messages: MessageWithParts[]
  baseRevisionID?: string
}): boolean {
  for (const message of input.messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state) || part.state.status !== "completed") continue
      if (!didCompletedWhiteboardCreateSave(part.state)) continue
      const revisionID = readToolMetadataString(part.state, "revisionID")
      if (
        revisionID !== undefined &&
        shouldApplyCompletedWhiteboardCreate({
          revisionID,
          baseRevisionID: input.baseRevisionID,
        })
      ) {
        return true
      }
    }
  }
  return false
}

function resolveStickyProgressiveWhiteboardPreview(input: {
  current: ProgressiveWhiteboardPreview | undefined
  computed: ProgressiveWhiteboardPreview | undefined
  retainWithoutComputed: boolean
}): ProgressiveWhiteboardPreview | undefined {
  if (input.computed) {
    return input.current?.signature === input.computed.signature ? input.current : input.computed
  }
  return input.retainWithoutComputed ? input.current : undefined
}

function countCompletedWhiteboardCreate(messages: MessageWithParts[]): number {
  let count = 0
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state) || part.state.status !== "completed") continue
      count += 1
    }
  }
  return count
}

function hasWhiteboardCreate(messages: MessageWithParts[]): boolean {
  return messages.some((message) =>
    message.parts.some((part) => part.type === "tool" && part.tool === "whiteboard_create_view"),
  )
}

function readLatestStreamingWhiteboardRaw(messages: MessageWithParts[]): string | undefined {
  for (const message of messages.toReversed()) {
    for (const part of message.parts.toReversed()) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue
      if (part.state.status !== "pending" && part.state.status !== "running") continue
      return typeof part.state.raw === "string" ? part.state.raw : undefined
    }
  }
  return undefined
}

function readLatestStreamingWhiteboardRestoreSceneID(
  messages: MessageWithParts[],
): string | undefined {
  const raw = readLatestStreamingWhiteboardRaw(messages)
  if (raw === undefined) return undefined
  return readRestoreSceneID(readProgramFromRaw(raw, "streaming"))
}

export {
  buildProgressiveWhiteboardElements,
  buildProgressiveWhiteboardPreview,
  buildProgressiveWhiteboardPreviewFromMessages,
  countCompletedWhiteboardCreate,
  decodePartialElementsArgument,
  hasActiveWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  hasWhiteboardCreate,
  parsePartialElements,
  readLatestStreamingWhiteboardRestoreSceneID,
  readLatestStreamingWhiteboardRaw,
  resolveStickyProgressiveWhiteboardPreview,
}
export type { ProgressiveWhiteboardPreview }
