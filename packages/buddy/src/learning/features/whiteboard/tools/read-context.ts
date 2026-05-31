import z from "zod"
import READ_CONTEXT_DESCRIPTION from "./read-context.md"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  readWhiteboardRevision,
  readWhiteboardSession,
} from "../service/store"
import type { WhiteboardElement, WhiteboardRevision } from "../service/types"

const ReadWhiteboardContextInputSchema = z.object({}).strict()
const MAX_CONTEXT_ELEMENTS = 120
const MAX_VISIBLE_TEXT_ITEMS = 80
const MAX_CONTEXT_TEXT_CHARS = 500

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
}

type LearnerEditSummary = {
  added?: string[]
  removed?: string[]
  movedOrResized?: string[]
  textChanged?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function readFiniteNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key]
  return isFiniteNumber(candidate) ? candidate : undefined
}

function truncateText(value: string): string {
  return value.length > MAX_CONTEXT_TEXT_CHARS
    ? `${value.slice(0, MAX_CONTEXT_TEXT_CHARS)}…`
    : value
}

function readTextCandidate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? truncateText(value)
    : undefined
}

function readElementText(element: WhiteboardElement): string | undefined {
  return readTextCandidate(element.text) ?? readTextCandidate(element.originalText)
}

function readLabelText(element: WhiteboardElement): string | undefined {
  if (!isRecord(element.label)) return undefined
  return readTextCandidate(element.label.text)
}

function readVisibleText(element: WhiteboardElement): string | undefined {
  return readElementText(element) ?? readLabelText(element)
}

function round(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value)
}

function formatContextElement(element: WhiteboardElement): ContextElement {
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
  if (typeof element.containerId === "string") formatted.containerId = element.containerId
  return formatted
}

function formatVisibleTextElement(element: WhiteboardElement) {
  const text = readVisibleText(element)
  if (!text) return undefined
  return {
    id: element.id,
    type: element.type,
    text,
    ...(typeof element.containerId === "string" ? { containerId: element.containerId } : {}),
  }
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
  previous: WhiteboardRevision
  latest: WhiteboardRevision
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

async function readLatestLearnerEditSummary(input: {
  directory: string
  sessionID: string
  latestRevision: WhiteboardRevision
  revisionIDs: string[]
}): Promise<LearnerEditSummary | undefined> {
  if (input.latestRevision.origin !== "learner" || input.revisionIDs.length < 2) {
    return undefined
  }
  const previousRevisionID = input.revisionIDs.at(-2)
  if (!previousRevisionID) return undefined
  const previousRevision = await readWhiteboardRevision(
    input.directory,
    input.sessionID,
    previousRevisionID,
  )
  return buildLearnerEditSummary({
    previous: previousRevision,
    latest: input.latestRevision,
  })
}

const readWhiteboardContextTool = createBuddyTool({
  id: "whiteboard_read_context",
  description: READ_CONTEXT_DESCRIPTION,
  parameters: ReadWhiteboardContextInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Reading Whiteboard",
      idle: "Read Whiteboard",
    },
  },
  async execute(_params, ctx) {
    const state = await readWhiteboardSession(ctx.directory, String(ctx.sessionID))
    const activeScene = state.activeScene
    if (!activeScene) {
      return {
        title: "Read Whiteboard",
        output: "No active whiteboard scene exists. Omit restoreCheckpoint to create a fresh scene.",
        metadata: {},
      }
    }
    const latestRevision = activeScene.latestRevision
    const learnerRevisionCount = activeScene.revisions.filter(
      (revision) => revision.origin === "learner",
    ).length
    const latestLearnerEditSummary = await readLatestLearnerEditSummary({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      latestRevision,
      revisionIDs: activeScene.revisions.map((revision) => revision.revisionID),
    })
    const allVisibleText = latestRevision.elements
      .map(formatVisibleTextElement)
      .filter((element) => element !== undefined)
    const visibleText = allVisibleText.slice(0, MAX_VISIBLE_TEXT_ITEMS)
    const elements = latestRevision.elements
      .slice(0, MAX_CONTEXT_ELEMENTS)
      .map(formatContextElement)
    return {
      title: "Read Whiteboard",
      output: JSON.stringify({
        continuationHandle: activeScene.continuationHandle,
        headRevisionID: activeScene.headRevisionID,
        revisionCount: activeScene.revisionCount,
        learnerRevisionCount,
        elementCount: latestRevision.elements.length,
        elementsTruncated: latestRevision.elements.length > elements.length,
        visibleText,
        visibleTextTruncated: allVisibleText.length > visibleText.length,
        ...(latestRevision.viewport ? { viewport: latestRevision.viewport } : {}),
        ...(latestLearnerEditSummary ? { latestLearnerEditSummary } : {}),
        elements,
      }),
      metadata: {
        sceneID: activeScene.sceneID,
        revisionID: activeScene.headRevisionID,
      },
    }
  },
})

export { ReadWhiteboardContextInputSchema, readWhiteboardContextTool }
