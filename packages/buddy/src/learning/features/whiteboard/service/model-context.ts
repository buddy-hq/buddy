import { WhiteboardStaleWriteError } from "../errors"
import type {
  WhiteboardBoard,
  WhiteboardBounds,
  WhiteboardElement,
  WhiteboardModelContext,
  WhiteboardModelContextAnchor,
} from "./types"

const MAX_STALE_DETAIL_COUNT = 5
const MAX_CONTEXT_TEXT_CHARS = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function readFiniteNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key]
  return isFiniteNumber(candidate) ? Math.round(candidate) : undefined
}

function truncateText(value: string): string {
  return value.length > MAX_CONTEXT_TEXT_CHARS
    ? `${value.slice(0, MAX_CONTEXT_TEXT_CHARS)}…`
    : value
}

function readTextCandidate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? truncateText(value) : undefined
}

function readElementText(element: WhiteboardElement): string | undefined {
  return readTextCandidate(element.text) ?? readTextCandidate(element.originalText)
}

function readLabelText(element: WhiteboardElement): string | undefined {
  if (!isRecord(element.label)) return undefined
  return readTextCandidate(element.label.text)
}

function roundBounds(bounds: WhiteboardBounds): WhiteboardBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function anchorForElement(input: {
  element: WhiteboardElement
  renderBounds?: WhiteboardBounds
}): WhiteboardModelContextAnchor {
  const anchor: WhiteboardModelContextAnchor = {
    id: input.element.id,
    type: input.element.type,
  }
  const x = readFiniteNumber(input.element, "x")
  const y = readFiniteNumber(input.element, "y")
  const width = readFiniteNumber(input.element, "width")
  const height = readFiniteNumber(input.element, "height")
  const text = readElementText(input.element)
  const labelText = readLabelText(input.element)
  if (x !== undefined) anchor.x = x
  if (y !== undefined) anchor.y = y
  if (width !== undefined) anchor.width = width
  if (height !== undefined) anchor.height = height
  if (text) anchor.text = text
  if (labelText) anchor.labelText = labelText
  if (typeof input.element.containerId === "string") anchor.containerId = input.element.containerId
  if (input.renderBounds) anchor.renderBounds = roundBounds(input.renderBounds)
  return anchor
}

function renderBoundsByElementID(board: WhiteboardBoard): Map<string, WhiteboardBounds> {
  return new Map(
    board.renderReport?.elements.map((element) => [element.id, element.bounds] as const) ?? [],
  )
}

function anchorsByID(
  anchors: WhiteboardModelContextAnchor[],
): Map<string, WhiteboardModelContextAnchor> {
  return new Map(anchors.map((anchor) => [anchor.id, anchor] as const))
}

function buildWhiteboardModelContext(board: WhiteboardBoard): WhiteboardModelContext {
  const boundsByID = renderBoundsByElementID(board)
  return {
    boardID: board.boardID,
    recordedAt: new Date().toISOString(),
    anchors: board.elements.map((element) =>
      anchorForElement({
        element,
        renderBounds: boundsByID.get(element.id),
      }),
    ),
  }
}

function formatGeometry(anchor: WhiteboardModelContextAnchor): string {
  const position =
    anchor.x !== undefined && anchor.y !== undefined ? `(${anchor.x},${anchor.y})` : "unknown"
  const size =
    anchor.width !== undefined && anchor.height !== undefined
      ? `${anchor.width}x${anchor.height}`
      : "unknown"
  return `${position} ${size}`
}

function formatBounds(bounds: WhiteboardBounds | undefined): string {
  if (!bounds) return "unavailable"
  return `(${bounds.x},${bounds.y}) ${bounds.width}x${bounds.height}`
}

function anchorChanges(input: {
  id: string
  seen?: WhiteboardModelContextAnchor
  current?: WhiteboardModelContextAnchor
}): string | undefined {
  if (!input.seen && input.current) {
    return `${input.id} was not in the model's last whiteboard context`
  }
  if (input.seen && !input.current) {
    return `${input.id} was removed after the model last saw it`
  }
  if (!input.seen || !input.current) return undefined

  const changes: string[] = []
  if (input.seen.type !== input.current.type) {
    changes.push(`type changed from ${input.seen.type} to ${input.current.type}`)
  }
  if (input.seen.containerId !== input.current.containerId) {
    changes.push(
      `container changed from ${input.seen.containerId ?? "none"} to ${input.current.containerId ?? "none"}`,
    )
  }
  if (
    input.seen.x !== input.current.x ||
    input.seen.y !== input.current.y ||
    input.seen.width !== input.current.width ||
    input.seen.height !== input.current.height
  ) {
    changes.push(
      `geometry changed from ${formatGeometry(input.seen)} to ${formatGeometry(input.current)}`,
    )
  }
  if (input.seen.text !== input.current.text) {
    changes.push(`text changed from "${input.seen.text ?? ""}" to "${input.current.text ?? ""}"`)
  }
  if (input.seen.labelText !== input.current.labelText) {
    changes.push(
      `label changed from "${input.seen.labelText ?? ""}" to "${input.current.labelText ?? ""}"`,
    )
  }
  if (
    input.seen.renderBounds &&
    input.current.renderBounds &&
    formatBounds(input.seen.renderBounds) !== formatBounds(input.current.renderBounds)
  ) {
    changes.push(
      `render bounds changed from ${formatBounds(input.seen.renderBounds)} to ${formatBounds(input.current.renderBounds)}`,
    )
  }
  return changes.length > 0 ? `${input.id} ${changes.join("; ")}` : undefined
}

function expandTouchedIDs(input: {
  touchedIDs: Set<string>
  currentAnchors: WhiteboardModelContextAnchor[]
  seenAnchors: WhiteboardModelContextAnchor[]
}): Set<string> {
  const expanded = new Set(input.touchedIDs)
  for (const anchor of [...input.currentAnchors, ...input.seenAnchors]) {
    if (anchor.containerId && input.touchedIDs.has(anchor.containerId)) {
      expanded.add(anchor.id)
    }
  }
  return expanded
}

function assertWhiteboardTouchedAnchorsFresh(input: {
  currentBoard: WhiteboardBoard | undefined
  modelContext: WhiteboardModelContext | undefined
  touchedIDs: Set<string>
}): void {
  if (input.touchedIDs.size === 0 || !input.currentBoard) return
  if (!input.modelContext) {
    throw new WhiteboardStaleWriteError(
      "Whiteboard context has not been read for this board. Call whiteboard_read_context before editing existing ids.",
    )
  }

  const currentContext = buildWhiteboardModelContext(input.currentBoard)
  const currentAnchorsByID = anchorsByID(currentContext.anchors)
  const seenAnchorsByID = anchorsByID(input.modelContext.anchors)
  const touchedIDs = expandTouchedIDs({
    touchedIDs: input.touchedIDs,
    currentAnchors: currentContext.anchors,
    seenAnchors: input.modelContext.anchors,
  })
  const staleDetails = [...touchedIDs]
    .map((id) =>
      anchorChanges({
        id,
        seen: seenAnchorsByID.get(id),
        current: currentAnchorsByID.get(id),
      }),
    )
    .filter((detail) => detail !== undefined)

  if (staleDetails.length === 0) return

  const shown = staleDetails.slice(0, MAX_STALE_DETAIL_COUNT).join("; ")
  const hidden = staleDetails.length - MAX_STALE_DETAIL_COUNT
  const suffix = hidden > 0 ? `; ${hidden} more touched id(s) changed` : ""
  throw new WhiteboardStaleWriteError(
    `Whiteboard changed for touched ids: ${shown}${suffix}. Call whiteboard_read_context before editing those ids.`,
  )
}

export { assertWhiteboardTouchedAnchorsFresh, buildWhiteboardModelContext }
