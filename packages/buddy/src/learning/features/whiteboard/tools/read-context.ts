import z from "zod"
import READ_CONTEXT_DESCRIPTION from "./read-context.md"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { BuddyObjectIDSchema } from "../../../../objects"
import {
  readAndRecordWhiteboardBoardContext,
  WHITEBOARD_CONTINUATION_HANDLE,
} from "../service/store"
import { buildWhiteboardLayoutDigest } from "../service/layout-digest"
import type {
  TJsonObject,
  WhiteboardBoard,
  WhiteboardBounds,
  WhiteboardElement,
} from "../service/types"
import { parseNonEmptyTString, parseTJsonObject } from "../service/types"

type TToolExecuteResult = {
  title: string
  output: string
  metadata: TJsonObject
}

const ReadWhiteboardContextInputSchema = z
  .object({
    objectID: BuddyObjectIDSchema.describe(
      "Stable id of the directory whiteboard object whose latest persisted board context should be read.",
    ),
  })
  .strict()
const MAX_CONTEXT_ELEMENTS = 120
const MAX_VISIBLE_TEXT_ITEMS = 80
const MAX_CONTEXT_TEXT_CHARS = 500
const RENDER_BOUNDS_DIFF_THRESHOLD = 2

type ContextElement = {
  id: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  labelText?: string
  containerId?: string
  renderBounds?: WhiteboardBounds
}

type LearnerEditSummary = {
  added?: string[]
  removed?: string[]
  movedOrResized?: string[]
  textChanged?: string[]
}

function readFiniteNumber(
  element: WhiteboardElement,
  key: "x" | "y" | "width" | "height",
): number | undefined {
  return element[key]
}

function truncateText(value: string): string {
  return value.length > MAX_CONTEXT_TEXT_CHARS
    ? `${value.slice(0, MAX_CONTEXT_TEXT_CHARS)}…`
    : value
}

function readTextCandidate<TValue>(value: TValue): string | undefined {
  const text = parseNonEmptyTString(value)
  return text === undefined ? undefined : truncateText(text)
}

function readElementText(element: WhiteboardElement): string | undefined {
  return readTextCandidate(element.text) ?? readTextCandidate(element.originalText)
}

function readLabelText(element: WhiteboardElement): string | undefined {
  const label = parseTJsonObject(element.label)
  if (label === undefined) return undefined
  return readTextCandidate(label.text)
}

function readVisibleText(element: WhiteboardElement): string | undefined {
  return readElementText(element) ?? readLabelText(element)
}

function round(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value)
}

function roundBounds(bounds: WhiteboardBounds): WhiteboardBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function readElementBounds(element: WhiteboardElement): WhiteboardBounds | undefined {
  const x = readFiniteNumber(element, "x")
  const y = readFiniteNumber(element, "y")
  const width = readFiniteNumber(element, "width")
  const height = readFiniteNumber(element, "height")
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }
  return { x, y, width, height }
}

function boundsDiffer(a: WhiteboardBounds, b: WhiteboardBounds): boolean {
  return (
    Math.abs(a.x - b.x) > RENDER_BOUNDS_DIFF_THRESHOLD ||
    Math.abs(a.y - b.y) > RENDER_BOUNDS_DIFF_THRESHOLD ||
    Math.abs(a.width - b.width) > RENDER_BOUNDS_DIFF_THRESHOLD ||
    Math.abs(a.height - b.height) > RENDER_BOUNDS_DIFF_THRESHOLD
  )
}

function renderBoundsByElementID(board: WhiteboardBoard): Map<string, WhiteboardBounds> {
  return new Map(
    board.renderReport?.elements.map((element) => [element.id, element.bounds] as const) ?? [],
  )
}

function formatContextElement(
  element: WhiteboardElement,
  renderBounds?: WhiteboardBounds,
): ContextElement {
  const formatted: ContextElement = {
    id: element.id,
    type: element.type,
  }
  const x = readFiniteNumber(element, "x")
  const y = readFiniteNumber(element, "y")
  const width = readFiniteNumber(element, "width")
  const height = readFiniteNumber(element, "height")
  const text = readElementText(element)
  const labelText = readLabelText(element)
  if (x !== undefined) formatted.x = round(x)
  if (y !== undefined) formatted.y = round(y)
  if (width !== undefined) formatted.width = round(width)
  if (height !== undefined) formatted.height = round(height)
  if (text) formatted.text = text
  if (labelText) formatted.labelText = labelText
  if (element.containerId !== undefined) formatted.containerId = element.containerId
  const rawBounds = readElementBounds(element)
  if (renderBounds && (!rawBounds || boundsDiffer(rawBounds, renderBounds))) {
    formatted.renderBounds = roundBounds(renderBounds)
  }
  return formatted
}

function formatVisibleTextElement(element: WhiteboardElement) {
  const text = readVisibleText(element)
  if (!text) return undefined
  return Object.assign(
    {
      id: element.id,
      type: element.type,
      text,
    },
    element.containerId !== undefined ? { containerId: element.containerId } : undefined,
  )
}

function elementGeometrySignature(element: WhiteboardElement): string {
  return [
    round(readFiniteNumber(element, "x")) ?? "",
    round(readFiniteNumber(element, "y")) ?? "",
    round(readFiniteNumber(element, "width")) ?? "",
    round(readFiniteNumber(element, "height")) ?? "",
  ].join(":")
}

function describeElement(element: WhiteboardElement): string {
  const text = readVisibleText(element)
  const x = round(readFiniteNumber(element, "x"))
  const y = round(readFiniteNumber(element, "y"))
  const width = round(readFiniteNumber(element, "width"))
  const height = round(readFiniteNumber(element, "height"))
  const textPart = text ? ` "${text}"` : ""
  const position = x !== undefined && y !== undefined ? ` at (${x},${y})` : ""
  const size = width !== undefined && height !== undefined ? ` ${width}x${height}` : ""
  return `${element.type}${textPart} (${element.id})${position}${size}`
}

function buildLearnerEditSummary(input: {
  previous: WhiteboardBoard
  latest: WhiteboardBoard
}): LearnerEditSummary | undefined {
  if (input.latest.origin !== "learner") return undefined

  const previousByID = new Map(
    input.previous.elements.map((element) => [element.id, element] as const),
  )
  const currentIDs = new Set<string>()
  const added: string[] = []
  const removed: string[] = []
  const movedOrResized: string[] = []
  const textChanged: string[] = []

  for (const element of input.latest.elements) {
    currentIDs.add(element.id)
    const previous = previousByID.get(element.id)
    if (!previous) {
      added.push(describeElement(element))
      continue
    }
    if (elementGeometrySignature(previous) !== elementGeometrySignature(element)) {
      movedOrResized.push(describeElement(element))
    }
    const previousText = readVisibleText(previous) ?? ""
    const currentText = readVisibleText(element) ?? ""
    if (previousText !== currentText) {
      textChanged.push(`${element.id}: "${previousText}" -> "${currentText}"`)
    }
  }

  for (const element of input.previous.elements) {
    if (!currentIDs.has(element.id)) {
      removed.push(element.id)
    }
  }

  const summary: LearnerEditSummary = {}
  if (added.length > 0) summary.added = added
  if (removed.length > 0) summary.removed = removed
  if (movedOrResized.length > 0) summary.movedOrResized = movedOrResized
  if (textChanged.length > 0) summary.textChanged = textChanged
  return Object.keys(summary).length > 0 ? summary : undefined
}

const readWhiteboardContextTool = createBuddyTool({
  id: "whiteboard_read_context",
  description: READ_CONTEXT_DESCRIPTION,
  parameters: ReadWhiteboardContextInputSchema,
  presentation: {
    archetype: "activity",
    icon: "read",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading Whiteboard" },
      running: { action: "Reading Whiteboard" },
      completed: { action: "Read Whiteboard" },
      error: { action: "Failed to read Whiteboard" },
    },
    summary: {
      category: "read-whiteboard",
      pending: "Reading Whiteboard",
      running: "Reading Whiteboard",
      completed: "Read Whiteboard",
      error: "Failed to read Whiteboard",
    },
  },
  async execute(params, ctx): Promise<TToolExecuteResult> {
    const context = await readAndRecordWhiteboardBoardContext(ctx.directory, params.objectID)
    const currentBoard = context.currentBoard
    if (!currentBoard) {
      return {
        title: "Read Whiteboard",
        output:
          'No whiteboard board exists. Create the first board with whiteboard_create_view using boardAction: "continue_current_board".',
        metadata: { objectID: params.objectID },
      }
    }
    const latestLearnerEditSummary = context.previousBoard
      ? buildLearnerEditSummary({
          previous: context.previousBoard,
          latest: currentBoard,
        })
      : undefined
    const allVisibleText = currentBoard.elements
      .map(formatVisibleTextElement)
      .filter((element) => element !== undefined)
    const visibleText = allVisibleText.slice(0, MAX_VISIBLE_TEXT_ITEMS)
    const renderBoundsByID = renderBoundsByElementID(currentBoard)
    const elements = currentBoard.elements
      .slice(0, MAX_CONTEXT_ELEMENTS)
      .map((element) => formatContextElement(element, renderBoundsByID.get(element.id)))
    const layout = buildWhiteboardLayoutDigest(currentBoard.renderReport)
    return {
      title: "Read Whiteboard",
      output: JSON.stringify(
        Object.assign(
          {
            continuationHandle: WHITEBOARD_CONTINUATION_HANDLE,
            currentBoardOrigin: currentBoard.origin,
            elementCount: currentBoard.elements.length,
            elementsTruncated: currentBoard.elements.length > elements.length,
            visibleText,
            visibleTextTruncated: allVisibleText.length > visibleText.length,
          },
          layout ? { layout } : undefined,
          currentBoard.viewport ? { viewport: currentBoard.viewport } : undefined,
          latestLearnerEditSummary ? { latestLearnerEditSummary } : undefined,
          {
            elements,
          },
        ),
      ),
      metadata: {
        objectID: params.objectID,
        boardID: currentBoard.boardID,
      },
    }
  },
})

export { ReadWhiteboardContextInputSchema, readWhiteboardContextTool }
