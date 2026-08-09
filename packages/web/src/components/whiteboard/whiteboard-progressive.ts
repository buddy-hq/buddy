import type { MessageWithParts } from "@/state/chat-types"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"

type ProgressiveWhiteboardPreview = {
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
  signature: string
}

type ProgressiveWhiteboardState = {
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
}

type ActiveWhiteboardCreate =
  | {
      toolKey: string
      sessionID: string
      phase: "awaiting-permission"
      requestKind: "new" | "existing"
    }
  | {
      toolKey: string
      sessionID: string
      phase: "authorized"
      requestKind: "new" | "existing"
      objectID: string
    }

type WhiteboardCreateObjectReference =
  | { status: "existing"; objectID: string }
  | { status: "new" }
  | { status: "unknown" }

type ProgramReadMode = "complete" | "streaming"
type ProgramWriteMode = "auto" | "continue" | "replace" | "invalid"
const WHITEBOARD_CONTINUATION_HANDLE = "current"
const SUPPORTED_WHITEBOARD_DRAWN_TYPES = new Set([
  "arrow",
  "diamond",
  "ellipse",
  "freedraw",
  "line",
  "rectangle",
  "text",
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

function decodePartialStringArgument(raw: string, key: string): string | undefined {
  const keyIndex = raw.indexOf(JSON.stringify(key))
  if (keyIndex === -1) return undefined
  const colonIndex = raw.indexOf(":", keyIndex + JSON.stringify(key).length)
  if (colonIndex === -1) return undefined
  let quoteIndex = colonIndex + 1
  while (/\s/u.test(raw[quoteIndex] ?? "")) quoteIndex += 1
  if (raw[quoteIndex] !== '"') return undefined

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

function hasPartialNullArgument(raw: string, key: string): boolean {
  const encodedKey = JSON.stringify(key)
  const keyIndex = raw.indexOf(encodedKey)
  if (keyIndex === -1) return false
  const colonIndex = raw.indexOf(":", keyIndex + encodedKey.length)
  if (colonIndex === -1) return false
  return /^\s*null(?:\s*[,}]|\s*$)/u.test(raw.slice(colonIndex + 1))
}

function decodePartialElementsArgument(raw: string): string | undefined {
  return decodePartialStringArgument(raw, "elements")
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

function readStreamingProgram(elements: string | undefined): unknown[] {
  return parsePartialElements(elements)
}

function readProgramFromElementsString(
  elements: string | undefined,
  mode: ProgramReadMode,
): unknown[] {
  if (mode === "streaming") return readStreamingProgram(elements)
  return elements ? (readJsonArray(elements) ?? []) : []
}

function readProgramFromRaw(raw: string | undefined, mode: ProgramReadMode): unknown[] {
  return readProgramFromElementsString(raw ? decodePartialElementsArgument(raw) : undefined, mode)
}

function isPersistedElement(value: unknown): value is PersistedWhiteboardElement {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    return false
  }
  return SUPPORTED_WHITEBOARD_DRAWN_TYPES.has(value.type)
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

function buildProgressiveWhiteboardSignature(input: {
  elements: PersistedWhiteboardElement[]
  viewport?: WhiteboardViewport
}): string {
  const viewport = input.viewport
    ? `${input.viewport.x}:${input.viewport.y}:${input.viewport.width}:${input.viewport.height}`
    : ""
  return `${viewport}|${input.elements.map(readElementSignature).join("|")}`
}

function toPreview(state: ProgressiveWhiteboardState): ProgressiveWhiteboardPreview {
  return {
    elements: state.elements,
    ...(state.viewport ? { viewport: state.viewport } : {}),
    signature: buildProgressiveWhiteboardSignature({
      elements: state.elements,
      ...(state.viewport ? { viewport: state.viewport } : {}),
    }),
  }
}

function toVisiblePreview(
  state: ProgressiveWhiteboardState,
): ProgressiveWhiteboardPreview | undefined {
  return state.elements.length > 0 ? toPreview(state) : undefined
}

function readProgramWriteMode(program: unknown[]): ProgramWriteMode {
  let hasRestore = false
  let hasReplacement = false
  for (let index = 0; index < program.length; index += 1) {
    const value = program[index]
    if (!isRecord(value) || typeof value.type !== "string") continue
    if (value.type === "replaceCurrentBoard") {
      if (index !== 0) return "invalid"
      hasReplacement = true
      continue
    }
    if (value.type === "restoreCheckpoint") {
      if (typeof value.id !== "string" || value.id !== WHITEBOARD_CONTINUATION_HANDLE) {
        return "invalid"
      }
      hasRestore = true
    }
  }
  if (hasRestore && hasReplacement) return "invalid"
  if (hasReplacement) return "replace"
  if (hasRestore) return "continue"
  return "auto"
}

function boardActionToProgramWriteMode(boardAction: string | undefined): ProgramWriteMode {
  switch (boardAction) {
    case "continue_current_board":
      return "continue"
    case "destructively_replace_current_board":
      return "replace"
    case "replace_current_board":
      return "replace"
    case undefined:
      return "auto"
    default:
      return "invalid"
  }
}

function readBoardActionFromRaw(raw: string | undefined): ProgramWriteMode {
  return boardActionToProgramWriteMode(
    raw ? decodePartialStringArgument(raw, "boardAction") : undefined,
  )
}

function resolveProgramWriteMode(input: {
  program: unknown[]
  requestedWriteMode: ProgramWriteMode
}): ProgramWriteMode {
  const embeddedWriteMode = readProgramWriteMode(input.program)
  if (embeddedWriteMode === "invalid" || input.requestedWriteMode === "invalid") return "invalid"
  if (input.requestedWriteMode === "auto") {
    return embeddedWriteMode === "auto" ? "continue" : embeddedWriteMode
  }
  if (embeddedWriteMode !== "auto" && embeddedWriteMode !== input.requestedWriteMode) {
    return "invalid"
  }
  return input.requestedWriteMode
}

function applyProgressiveProgram(input: {
  current: ProgressiveWhiteboardState
  program: unknown[]
  requestedWriteMode: ProgramWriteMode
}): ProgressiveWhiteboardState {
  const writeMode = resolveProgramWriteMode({
    program: input.program,
    requestedWriteMode: input.requestedWriteMode,
  })
  if (writeMode === "invalid") return input.current
  const continuesCurrentBoard = writeMode === "continue"
  let elements = continuesCurrentBoard ? [...input.current.elements] : []
  let viewport = continuesCurrentBoard ? input.current.viewport : undefined

  for (let index = 0; index < input.program.length; index += 1) {
    const value = input.program[index]
    if (!isRecord(value) || typeof value.type !== "string") continue
    if (value.type === "restoreCheckpoint") continue
    if (value.type === "replaceCurrentBoard") continue
    if (value.type === "cameraUpdate") {
      viewport = parseCameraViewport(value) ?? viewport
      continue
    }
    if (value.type === "delete") {
      elements = deleteElements(elements, parseDeleteIDs(value))
      continue
    }
    if (value.type === "translate") {
      elements = translateElements(elements, value)
      continue
    }
    if (!isPersistedElement(value)) continue
    if (elements.some((element) => element.id === value.id)) continue
    elements.push(value)
  }
  return {
    elements,
    ...(viewport ? { viewport } : {}),
  }
}

function buildProgressiveWhiteboardPreview(input: {
  raw: string | undefined
  baseElements: PersistedWhiteboardElement[]
}): ProgressiveWhiteboardPreview | undefined {
  const program = readProgramFromRaw(input.raw, "streaming")
  if (program.length === 0) return undefined
  const requestedWriteMode = readBoardActionFromRaw(input.raw)
  return toVisiblePreview(
    applyProgressiveProgram({
      current: {
        elements: [...input.baseElements],
      },
      program,
      requestedWriteMode,
    }),
  )
}

function buildProgressiveWhiteboardElements(input: {
  raw: string | undefined
  baseElements: PersistedWhiteboardElement[]
}): PersistedWhiteboardElement[] | undefined {
  return buildProgressiveWhiteboardPreview(input)?.elements
}

function readToolInputElements(state: Record<string, unknown>): string | undefined {
  if (!isRecord(state.input)) return undefined
  return typeof state.input.elements === "string" ? state.input.elements : undefined
}

function readToolInputBoardAction(state: Record<string, unknown>): ProgramWriteMode {
  if (!isRecord(state.input)) return "auto"
  return boardActionToProgramWriteMode(
    typeof state.input.boardAction === "string" ? state.input.boardAction : undefined,
  )
}

function readRequestedWhiteboardCreateObjectReference(
  state: Record<string, unknown>,
): WhiteboardCreateObjectReference {
  if (isRecord(state.input)) {
    if (typeof state.input.objectID === "string") {
      return { status: "existing", objectID: state.input.objectID }
    }
    if (state.input.objectID === null) return { status: "new" }
  }
  if (typeof state.raw !== "string") return { status: "unknown" }
  const rawObjectID = decodePartialStringArgument(state.raw, "objectID")
  if (rawObjectID) return { status: "existing", objectID: rawObjectID }
  return hasPartialNullArgument(state.raw, "objectID") ? { status: "new" } : { status: "unknown" }
}

function readWhiteboardCreateObjectReference(
  state: Record<string, unknown>,
): WhiteboardCreateObjectReference {
  const metadataObjectID = readToolMetadataString(state, "objectID")
  if (metadataObjectID) return { status: "existing", objectID: metadataObjectID }
  return readRequestedWhiteboardCreateObjectReference(state)
}

function whiteboardCreateTargetsObject(
  state: Record<string, unknown>,
  objectID: string | undefined,
): boolean {
  if (objectID === undefined) return true
  const reference = readWhiteboardCreateObjectReference(state)
  if (reference.status === "existing") return reference.objectID === objectID
  return false
}

function readToolMetadataString(state: Record<string, unknown>, key: string): string | undefined {
  if (!isRecord(state.metadata)) return undefined
  return typeof state.metadata[key] === "string" ? state.metadata[key] : undefined
}

function readToolMetadataBoolean(state: Record<string, unknown>, key: string): boolean | undefined {
  if (!isRecord(state.metadata)) return undefined
  return typeof state.metadata[key] === "boolean" ? state.metadata[key] : undefined
}

function whiteboardCreateToolKey(messageID: string, partID: string): string {
  return `${messageID}:${partID}`
}

function didCompletedWhiteboardCreateSave(state: Record<string, unknown>): boolean {
  return readToolMetadataBoolean(state, "saved") !== false
}

function shouldApplyCompletedWhiteboardCreate(input: {
  boardID: string | undefined
  baseBoardID: string | undefined
}): boolean {
  if (input.baseBoardID === undefined) return true
  return input.boardID !== undefined && input.boardID > input.baseBoardID
}

function buildProgressiveWhiteboardPreviewFromMessages(input: {
  messages: MessageWithParts[]
  objectID?: string
  toolKey?: string
  baseBoardID?: string
  baseElements: PersistedWhiteboardElement[]
  baseViewport?: WhiteboardViewport
}): ProgressiveWhiteboardPreview | undefined {
  let state: ProgressiveWhiteboardState = {
    elements: [...input.baseElements],
    ...(input.baseViewport ? { viewport: input.baseViewport } : {}),
  }
  let appliedProgram = false
  let hasStreamingTool = false

  for (const message of input.messages) {
    const messageAllowsStreaming =
      message.info.role === "assistant" && !isTerminalAssistantMessageInfo(message.info)
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue
      if (
        input.toolKey !== undefined &&
        whiteboardCreateToolKey(message.info.id, part.id) !== input.toolKey
      ) {
        continue
      }
      if (!whiteboardCreateTargetsObject(part.state, input.objectID)) {
        continue
      }

      if (part.state.status === "completed") {
        if (!didCompletedWhiteboardCreateSave(part.state)) continue
        const boardID = readToolMetadataString(part.state, "boardID")
        if (
          !shouldApplyCompletedWhiteboardCreate({
            boardID,
            baseBoardID: input.baseBoardID,
          })
        ) {
          continue
        }
        const program = readProgramFromElementsString(readToolInputElements(part.state), "complete")
        if (program.length === 0) continue
        state = applyProgressiveProgram({
          current: state,
          program,
          requestedWriteMode: readToolInputBoardAction(part.state),
        })
        appliedProgram = true
        continue
      }

      if (!messageAllowsStreaming) continue
      if (part.state.status !== "pending" && part.state.status !== "running") continue
      hasStreamingTool = true
      const program = readProgramFromRaw(
        typeof part.state.raw === "string" ? part.state.raw : undefined,
        "streaming",
      )
      if (program.length === 0) continue
      state = applyProgressiveProgram({
        current: state,
        program,
        requestedWriteMode: readBoardActionFromRaw(
          typeof part.state.raw === "string" ? part.state.raw : undefined,
        ),
      })
      appliedProgram = true
    }
  }

  if (!appliedProgram) return undefined
  if (!hasStreamingTool && input.baseBoardID !== undefined) return undefined
  return toVisiblePreview(state)
}

function hasActiveWhiteboardCreate(
  messages: MessageWithParts[],
  objectID?: string,
  toolKey?: string,
): boolean {
  return messages.some(
    (message) =>
      message.info.role === "assistant" &&
      !isTerminalAssistantMessageInfo(message.info) &&
      message.parts.some((part) => {
        if (part.type !== "tool" || part.tool !== "whiteboard_create_view") return false
        if (!isRecord(part.state)) return false
        if (
          toolKey !== undefined &&
          whiteboardCreateToolKey(message.info.id, part.id) !== toolKey
        ) {
          return false
        }
        if (!whiteboardCreateTargetsObject(part.state, objectID)) {
          return false
        }
        return part.state.status === "pending" || part.state.status === "running"
      }),
  )
}

function readLatestActiveWhiteboardCreate(
  messages: MessageWithParts[],
): ActiveWhiteboardCreate | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role !== "assistant" || isTerminalAssistantMessageInfo(message.info)) {
      continue
    }

    for (const part of message.parts.toReversed()) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue
      if (part.state.status !== "pending" && part.state.status !== "running") continue
      const toolKey = whiteboardCreateToolKey(message.info.id, part.id)
      const requestedReference = readRequestedWhiteboardCreateObjectReference(part.state)
      const authorizedObjectID = readToolMetadataString(part.state, "objectID")
      if (authorizedObjectID) {
        return {
          toolKey,
          sessionID: part.sessionID,
          phase: "authorized",
          // Authorized metadata is enough to present the real object. Only an explicit null
          // request may retain the zero-content transient preview during that handoff.
          requestKind: requestedReference.status === "new" ? "new" : "existing",
          objectID: authorizedObjectID,
        }
      }
      if (requestedReference.status === "unknown") return undefined
      return {
        toolKey,
        sessionID: part.sessionID,
        phase: "awaiting-permission",
        requestKind: requestedReference.status,
      }
    }
  }

  return undefined
}

function readLatestActiveWhiteboardCreateKey(messages: MessageWithParts[]): string | undefined {
  return readLatestActiveWhiteboardCreate(messages)?.toolKey
}

function hasUnfetchedCompletedWhiteboardCreate(input: {
  messages: MessageWithParts[]
  objectID?: string
  baseBoardID?: string
}): boolean {
  for (const message of input.messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state) || part.state.status !== "completed") continue
      if (!whiteboardCreateTargetsObject(part.state, input.objectID)) continue
      if (!didCompletedWhiteboardCreateSave(part.state)) continue
      const boardID = readToolMetadataString(part.state, "boardID")
      if (
        boardID !== undefined &&
        shouldApplyCompletedWhiteboardCreate({
          boardID,
          baseBoardID: input.baseBoardID,
        })
      ) {
        return true
      }
    }
  }
  return false
}

function hasLatestFailedWhiteboardCreate(messages: MessageWithParts[], objectID?: string): boolean {
  for (const message of messages.toReversed()) {
    for (const part of message.parts.toReversed()) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue
      if (!whiteboardCreateTargetsObject(part.state, objectID)) {
        continue
      }
      return part.state.status === "error"
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

function countCompletedWhiteboardCreate(messages: MessageWithParts[], objectID?: string): number {
  let count = 0
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state) || part.state.status !== "completed") continue
      if (!whiteboardCreateTargetsObject(part.state, objectID)) continue
      count += 1
    }
  }
  return count
}

function hasWhiteboardCreate(messages: MessageWithParts[], objectID?: string): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") return false
      if (!isRecord(part.state)) return objectID === undefined
      return whiteboardCreateTargetsObject(part.state, objectID)
    }),
  )
}

function readLatestStreamingWhiteboardRaw(messages: MessageWithParts[]): string | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role !== "assistant" || isTerminalAssistantMessageInfo(message.info)) {
      continue
    }

    for (const part of message.parts.toReversed()) {
      if (part.type !== "tool" || part.tool !== "whiteboard_create_view") continue
      if (!isRecord(part.state)) continue
      if (part.state.status !== "pending" && part.state.status !== "running") continue
      return typeof part.state.raw === "string" ? part.state.raw : undefined
    }
  }
  return undefined
}

export {
  buildProgressiveWhiteboardElements,
  buildProgressiveWhiteboardPreview,
  buildProgressiveWhiteboardPreviewFromMessages,
  buildProgressiveWhiteboardSignature,
  countCompletedWhiteboardCreate,
  decodePartialElementsArgument,
  hasActiveWhiteboardCreate,
  hasLatestFailedWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  hasWhiteboardCreate,
  parsePartialElements,
  readLatestActiveWhiteboardCreateKey,
  readLatestActiveWhiteboardCreate,
  readLatestStreamingWhiteboardRaw,
  resolveStickyProgressiveWhiteboardPreview,
}
export type { ProgressiveWhiteboardPreview }
