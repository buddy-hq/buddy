import { z } from "zod"
import type { MessageWithParts, MessagePart } from "@/state/chat-types"
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
      requestKind: "new" | "existing" | "unknown"
    }
  | {
      toolKey: string
      sessionID: string
      phase: "authorized"
      requestKind: "new" | "existing" | "unknown"
      objectID: string
    }

type WhiteboardCreateObjectReference =
  | { status: "existing"; objectID: string }
  | { status: "new" }
  | { status: "unknown" }

type ProgramReadMode = "complete" | "streaming"
type ProgramWriteMode = "auto" | "continue" | "replace" | "invalid"

type TJsonPrimitive = string | number | boolean | null
type TJsonObject = { readonly [key: string]: TJsonValue }
type TJsonValue = TJsonPrimitive | TJsonObject | readonly TJsonValue[]

type TWhiteboardCreateToolState = {
  status: string
  input?: TJsonObject
  metadata?: TJsonObject
  raw?: string
}

const WHITEBOARD_CONTINUATION_HANDLE = "current"
const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view"
const WHITEBOARD_TOOL_PENDING_STATUS = "pending"
const WHITEBOARD_TOOL_RUNNING_STATUS = "running"
const WHITEBOARD_TOOL_COMPLETED_STATUS = "completed"
const WHITEBOARD_TOOL_ERROR_STATUS = "error"
const SUPPORTED_WHITEBOARD_DRAWN_TYPES = new Set([
  "arrow",
  "diamond",
  "ellipse",
  "freedraw",
  "line",
  "rectangle",
  "text",
])

const jsonValueSchema: z.ZodType<TJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

const jsonObjectSchema: z.ZodType<TJsonObject> = z.lazy(() =>
  z.record(z.string(), jsonValueSchema),
)

const whiteboardCreateToolStateSchema = z.object({
  status: z.string(),
  input: jsonObjectSchema.optional(),
  metadata: jsonObjectSchema.optional(),
  raw: z.string().optional(),
})

const whiteboardViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
})

const elementPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const elementContainerIdSchema = z.object({
  containerId: z.string().optional(),
})

function parseJsonObject(value: TJsonValue): TJsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseJsonString(value: TJsonValue | undefined): string | undefined {
  if (value === undefined) return undefined
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseJsonFiniteNumber(value: TJsonValue | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = z.number().finite().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseJsonBoolean(value: TJsonValue | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const parsed = z.boolean().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseWhiteboardCreateToolState(
  part: MessagePart,
): TWhiteboardCreateToolState | undefined {
  const parsed = whiteboardCreateToolStateSchema.safeParse(part.state)
  return parsed.success ? parsed.data : undefined
}

function isPersistedWhiteboardElement(
  value: TJsonObject,
): value is TJsonObject & PersistedWhiteboardElement {
  const id = parseJsonString(value.id)
  const type = parseJsonString(value.type)
  return id !== undefined && type !== undefined && SUPPORTED_WHITEBOARD_DRAWN_TYPES.has(type)
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

function readJsonArray(value: string): TJsonValue[] | undefined {
  try {
    const parsed = jsonValueSchema.safeParse(JSON.parse(value))
    if (!parsed.success || !Array.isArray(parsed.data)) return undefined
    return [...parsed.data]
  } catch {
    return undefined
  }
}

function parsePartialElements(value: string | undefined): TJsonValue[] {
  if (!value?.trim().startsWith("[")) return []
  const complete = readJsonArray(value)
  if (complete) return complete
  const lastCompleteObject = value.lastIndexOf("}")
  if (lastCompleteObject === -1) return []
  return readJsonArray(`${value.slice(0, lastCompleteObject + 1)}]`) ?? []
}

function readStreamingProgram(elements: string | undefined): TJsonValue[] {
  return parsePartialElements(elements)
}

function readProgramFromElementsString(
  elements: string | undefined,
  mode: ProgramReadMode,
): TJsonValue[] {
  if (mode === "streaming") return readStreamingProgram(elements)
  return elements ? (readJsonArray(elements) ?? []) : []
}

function readProgramFromRaw(raw: string | undefined, mode: ProgramReadMode): TJsonValue[] {
  return readProgramFromElementsString(raw ? decodePartialElementsArgument(raw) : undefined, mode)
}

function parsePersistedElement(value: TJsonValue): PersistedWhiteboardElement | undefined {
  const record = parseJsonObject(value)
  if (record === undefined || !isPersistedWhiteboardElement(record)) return undefined
  return record
}

function parseElementContainerId(element: PersistedWhiteboardElement): string | undefined {
  const parsed = elementContainerIdSchema.safeParse(element)
  return parsed.success ? parsed.data.containerId : undefined
}

function parseElementPosition(
  element: PersistedWhiteboardElement,
): { x: number; y: number } | undefined {
  const parsed = elementPositionSchema.safeParse(element)
  return parsed.success ? parsed.data : undefined
}

function deleteElements(
  elements: PersistedWhiteboardElement[],
  ids: Set<string>,
): PersistedWhiteboardElement[] {
  return elements.filter((element) => {
    if (ids.has(element.id)) return false
    const containerId = parseElementContainerId(element)
    return containerId === undefined || !ids.has(containerId)
  })
}

function parseDeleteIDs(value: TJsonObject): Set<string> {
  const raw = parseJsonString(value.ids) ?? parseJsonString(value.id)
  if (raw === undefined) return new Set()
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

function translateElements(
  elements: PersistedWhiteboardElement[],
  value: TJsonObject,
): PersistedWhiteboardElement[] {
  const idsValue = parseJsonString(value.ids)
  const dx = parseJsonFiniteNumber(value.dx)
  const dy = parseJsonFiniteNumber(value.dy)
  if (idsValue === undefined || dx === undefined || dy === undefined) return elements
  const ids = new Set(
    idsValue
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  for (const element of elements) {
    const containerId = parseElementContainerId(element)
    if (containerId !== undefined && ids.has(containerId)) {
      ids.add(element.id)
    }
  }
  return elements.map((element) => {
    if (!ids.has(element.id)) return element
    const position = parseElementPosition(element)
    if (position === undefined) return element
    return Object.assign({}, element, {
      x: position.x + dx,
      y: position.y + dy,
    })
  })
}

function parseCameraViewport(value: TJsonObject): WhiteboardViewport | undefined {
  const parsed = whiteboardViewportSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
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
  return Object.assign(
    {
      elements: state.elements,
      signature: buildProgressiveWhiteboardSignature(
        Object.assign(
          { elements: state.elements },
          state.viewport ? { viewport: state.viewport } : undefined,
        ),
      ),
    },
    state.viewport ? { viewport: state.viewport } : undefined,
  )
}

function toVisiblePreview(
  state: ProgressiveWhiteboardState,
): ProgressiveWhiteboardPreview | undefined {
  return state.elements.length > 0 ? toPreview(state) : undefined
}

function readProgramWriteMode(program: TJsonValue[]): ProgramWriteMode {
  let hasRestore = false
  let hasReplacement = false
  for (let index = 0; index < program.length; index += 1) {
    const record = parseJsonObject(program[index])
    if (record === undefined) continue
    const type = parseJsonString(record.type)
    if (type === undefined) continue
    if (type === "replaceCurrentBoard") {
      if (index !== 0) return "invalid"
      hasReplacement = true
      continue
    }
    if (type === "restoreCheckpoint") {
      if (parseJsonString(record.id) !== WHITEBOARD_CONTINUATION_HANDLE) {
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
  program: TJsonValue[]
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
  program: TJsonValue[]
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
    const record = parseJsonObject(input.program[index])
    if (record === undefined) continue
    const type = parseJsonString(record.type)
    if (type === undefined) continue
    if (type === "restoreCheckpoint") continue
    if (type === "replaceCurrentBoard") continue
    if (type === "cameraUpdate") {
      viewport = parseCameraViewport(record) ?? viewport
      continue
    }
    if (type === "delete") {
      elements = deleteElements(elements, parseDeleteIDs(record))
      continue
    }
    if (type === "translate") {
      elements = translateElements(elements, record)
      continue
    }
    const persisted = parsePersistedElement(record)
    if (persisted === undefined) continue
    if (elements.some((element) => element.id === persisted.id)) continue
    elements.push(persisted)
  }
  return Object.assign({ elements }, viewport ? { viewport } : undefined)
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

function readToolInputElements(state: TWhiteboardCreateToolState): string | undefined {
  return parseJsonString(state.input?.elements)
}

function readToolInputBoardAction(state: TWhiteboardCreateToolState): ProgramWriteMode {
  return boardActionToProgramWriteMode(parseJsonString(state.input?.boardAction))
}

function readRequestedWhiteboardCreateObjectReference(
  state: TWhiteboardCreateToolState,
): WhiteboardCreateObjectReference {
  const inputObjectAction = parseJsonString(state.input?.objectAction)
  if (inputObjectAction === "create") return { status: "new" }
  const inputObjectID = state.input?.objectID
  const existingObjectID = parseJsonString(inputObjectID)
  if (existingObjectID !== undefined) {
    return { status: "existing", objectID: existingObjectID }
  }
  if (inputObjectID === null) return { status: "new" }
  if (state.raw === undefined) return { status: "unknown" }
  const rawObjectAction = decodePartialStringArgument(state.raw, "objectAction")
  if (rawObjectAction === "create") return { status: "new" }
  const rawObjectID = decodePartialStringArgument(state.raw, "objectID")
  if (rawObjectID) return { status: "existing", objectID: rawObjectID }
  return hasPartialNullArgument(state.raw, "objectID") ? { status: "new" } : { status: "unknown" }
}

function readWhiteboardCreateObjectReference(
  state: TWhiteboardCreateToolState,
): WhiteboardCreateObjectReference {
  const metadataObjectID = readToolMetadataString(state, "objectID")
  if (metadataObjectID) return { status: "existing", objectID: metadataObjectID }
  return readRequestedWhiteboardCreateObjectReference(state)
}

function whiteboardCreateTargetsObject(
  state: TWhiteboardCreateToolState,
  objectID: string | undefined,
): boolean {
  if (objectID === undefined) return true
  const reference = readWhiteboardCreateObjectReference(state)
  if (reference.status === "existing") return reference.objectID === objectID
  return false
}

function readToolMetadataString(
  state: TWhiteboardCreateToolState,
  key: string,
): string | undefined {
  return parseJsonString(state.metadata?.[key])
}

function readToolMetadataBoolean(
  state: TWhiteboardCreateToolState,
  key: string,
): boolean | undefined {
  return parseJsonBoolean(state.metadata?.[key])
}

function whiteboardCreateToolKey(messageID: string, partID: string): string {
  return `${messageID}:${partID}`
}

function didCompletedWhiteboardCreateSave(state: TWhiteboardCreateToolState): boolean {
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
  let state: ProgressiveWhiteboardState = Object.assign(
    { elements: [...input.baseElements] },
    input.baseViewport ? { viewport: input.baseViewport } : undefined,
  )
  let appliedProgram = false
  let hasStreamingTool = false

  for (const message of input.messages) {
    const messageAllowsStreaming =
      message.info.role === "assistant" && !isTerminalAssistantMessageInfo(message.info)
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined) continue
      if (
        input.toolKey !== undefined &&
        whiteboardCreateToolKey(message.info.id, part.id) !== input.toolKey
      ) {
        continue
      }
      if (!whiteboardCreateTargetsObject(toolState, input.objectID)) {
        continue
      }

      if (toolState.status === WHITEBOARD_TOOL_COMPLETED_STATUS) {
        if (!didCompletedWhiteboardCreateSave(toolState)) continue
        const boardID = readToolMetadataString(toolState, "boardID")
        if (
          !shouldApplyCompletedWhiteboardCreate({
            boardID,
            baseBoardID: input.baseBoardID,
          })
        ) {
          continue
        }
        const program = readProgramFromElementsString(
          readToolInputElements(toolState),
          "complete",
        )
        if (program.length === 0) continue
        state = applyProgressiveProgram({
          current: state,
          program,
          requestedWriteMode: readToolInputBoardAction(toolState),
        })
        appliedProgram = true
        continue
      }

      if (!messageAllowsStreaming) continue
      if (
        toolState.status !== WHITEBOARD_TOOL_PENDING_STATUS &&
        toolState.status !== WHITEBOARD_TOOL_RUNNING_STATUS
      ) {
        continue
      }
      hasStreamingTool = true
      const program = readProgramFromRaw(toolState.raw, "streaming")
      if (program.length === 0) continue
      state = applyProgressiveProgram({
        current: state,
        program,
        requestedWriteMode: readBoardActionFromRaw(toolState.raw),
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
        if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) return false
        const toolState = parseWhiteboardCreateToolState(part)
        if (toolState === undefined) return false
        if (
          toolKey !== undefined &&
          whiteboardCreateToolKey(message.info.id, part.id) !== toolKey
        ) {
          return false
        }
        if (!whiteboardCreateTargetsObject(toolState, objectID)) {
          return false
        }
        return (
          toolState.status === WHITEBOARD_TOOL_PENDING_STATUS ||
          toolState.status === WHITEBOARD_TOOL_RUNNING_STATUS
        )
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
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined) continue
      if (
        toolState.status !== WHITEBOARD_TOOL_PENDING_STATUS &&
        toolState.status !== WHITEBOARD_TOOL_RUNNING_STATUS
      ) {
        continue
      }
      const toolKey = whiteboardCreateToolKey(message.info.id, part.id)
      const requestedReference = readRequestedWhiteboardCreateObjectReference(toolState)
      const authorizedObjectID = readToolMetadataString(toolState, "objectID")
      if (authorizedObjectID) {
        return {
          toolKey,
          sessionID: part.sessionID,
          phase: "authorized",
          requestKind: requestedReference.status,
          objectID: authorizedObjectID,
        }
      }
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
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined || toolState.status !== WHITEBOARD_TOOL_COMPLETED_STATUS) continue
      if (!whiteboardCreateTargetsObject(toolState, input.objectID)) continue
      if (!didCompletedWhiteboardCreateSave(toolState)) continue
      const boardID = readToolMetadataString(toolState, "boardID")
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
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined) continue
      if (!whiteboardCreateTargetsObject(toolState, objectID)) {
        continue
      }
      return toolState.status === WHITEBOARD_TOOL_ERROR_STATUS
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
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined || toolState.status !== WHITEBOARD_TOOL_COMPLETED_STATUS) continue
      if (!whiteboardCreateTargetsObject(toolState, objectID)) continue
      count += 1
    }
  }
  return count
}

function hasWhiteboardCreate(messages: MessageWithParts[], objectID?: string): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) return false
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined) return objectID === undefined
      return whiteboardCreateTargetsObject(toolState, objectID)
    }),
  )
}

function readLatestStreamingWhiteboardRaw(messages: MessageWithParts[]): string | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role !== "assistant" || isTerminalAssistantMessageInfo(message.info)) {
      continue
    }

    for (const part of message.parts.toReversed()) {
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const toolState = parseWhiteboardCreateToolState(part)
      if (toolState === undefined) continue
      if (
        toolState.status !== WHITEBOARD_TOOL_PENDING_STATUS &&
        toolState.status !== WHITEBOARD_TOOL_RUNNING_STATUS
      ) {
        continue
      }
      return toolState.raw
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
