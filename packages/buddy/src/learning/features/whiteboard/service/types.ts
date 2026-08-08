import z from "zod"
import { BuddyObjectIDSchema } from "../../../../objects"
import { WhiteboardElementValidationError } from "../errors"

const SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPES = [
  "arrow",
  "diamond",
  "ellipse",
  "freedraw",
  "line",
  "rectangle",
  "text",
] as const
const SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_SET = new Set<string>(
  SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPES,
)
const SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_LIST =
  SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPES.join(", ")

const WhiteboardElementSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().trim().min(1),
  })
  .loose()

const WhiteboardViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict()

const WhiteboardBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict()

const WhiteboardRenderReportElementSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().trim().min(1),
    version: z.number().finite().optional(),
    versionNonce: z.number().finite().optional(),
    containerId: z.string().trim().min(1).optional(),
    text: z.string().optional(),
    fontSize: z.number().finite().positive().optional(),
    backgroundColor: z.string().optional(),
    fillStyle: z.string().optional(),
    opacity: z.number().finite().optional(),
    bounds: WhiteboardBoundsSchema,
  })
  .strict()

const WhiteboardRenderReportSchema = z
  .object({
    boardID: z.string().trim().min(1),
    viewport: WhiteboardViewportSchema,
    canvas: z
      .object({
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
        zoom: z.number().finite().positive(),
      })
      .strict(),
    contentBounds: WhiteboardBoundsSchema.nullable(),
    elements: z.array(WhiteboardRenderReportElementSchema),
  })
  .strict()

const WhiteboardRenderReportSaveResponseSchema = z
  .object({
    saved: z.boolean(),
  })
  .strict()

const WhiteboardModelContextAnchorSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().trim().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    text: z.string().optional(),
    labelText: z.string().optional(),
    containerId: z.string().trim().min(1).optional(),
    renderBounds: WhiteboardBoundsSchema.optional(),
  })
  .strict()

const WhiteboardModelContextSchema = z
  .object({
    boardID: z.string().trim().min(1),
    recordedAt: z.string().datetime(),
    anchors: z.array(WhiteboardModelContextAnchorSchema),
  })
  .strict()

const WhiteboardBoardOriginSchema = z.enum(["agent", "learner"])

const WhiteboardBoardSchema = z
  .object({
    boardID: z.string().trim().min(1),
    origin: WhiteboardBoardOriginSchema,
    updatedAt: z.string().datetime(),
    elements: z.array(WhiteboardElementSchema),
    viewport: WhiteboardViewportSchema.optional(),
    renderReport: WhiteboardRenderReportSchema.optional(),
  })
  .strict()

const WhiteboardObjectBoardSchema = WhiteboardBoardSchema.omit({
  renderReport: true,
})

const WhiteboardObjectStateSchema = z
  .object({
    version: z.literal(3),
    currentBoard: WhiteboardBoardSchema.optional(),
    previousBoard: WhiteboardBoardSchema.optional(),
    modelContext: WhiteboardModelContextSchema.optional(),
  })
  .strict()

const LegacyWhiteboardSessionStateSchema = z
  .object({
    version: z.literal(2),
    sessionID: z.string().trim().min(1),
    currentBoard: WhiteboardBoardSchema.optional(),
    previousBoard: WhiteboardBoardSchema.optional(),
    modelContext: WhiteboardModelContextSchema.optional(),
  })
  .strict()

const WhiteboardObjectReadSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    currentBoard: WhiteboardObjectBoardSchema.nullable(),
  })
  .strict()

const WhiteboardCreationReservationRequestSchema = z
  .object({
    sessionID: z.string().trim().min(1),
    messageID: z.string().trim().min(1),
    callID: z.string().trim().min(1),
  })
  .strict()

const WhiteboardCreationReservationResponseSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const WhiteboardLearnerEditRequestSchema = z
  .object({
    baseBoardID: z.string().trim().min(1),
    elements: z.array(WhiteboardElementSchema),
    viewport: WhiteboardViewportSchema.optional(),
  })
  .strict()

type WhiteboardBoard = z.infer<typeof WhiteboardBoardSchema>
type WhiteboardBoardOrigin = z.infer<typeof WhiteboardBoardOriginSchema>
type WhiteboardBounds = z.infer<typeof WhiteboardBoundsSchema>
type WhiteboardElement = z.infer<typeof WhiteboardElementSchema>
type WhiteboardModelContext = z.infer<typeof WhiteboardModelContextSchema>
type WhiteboardModelContextAnchor = z.infer<typeof WhiteboardModelContextAnchorSchema>
type WhiteboardRenderReport = z.infer<typeof WhiteboardRenderReportSchema>
type WhiteboardRenderReportElement = z.infer<typeof WhiteboardRenderReportElementSchema>
type WhiteboardRenderReportSaveResponse = z.infer<typeof WhiteboardRenderReportSaveResponseSchema>
type WhiteboardObjectBoard = z.infer<typeof WhiteboardObjectBoardSchema>
type WhiteboardViewport = z.infer<typeof WhiteboardViewportSchema>
type WhiteboardObjectState = z.infer<typeof WhiteboardObjectStateSchema>
type WhiteboardObjectRead = z.infer<typeof WhiteboardObjectReadSchema>
type WhiteboardCreationReservationRequest = z.infer<
  typeof WhiteboardCreationReservationRequestSchema
>
type WhiteboardCreationReservationResponse = z.infer<
  typeof WhiteboardCreationReservationResponseSchema
>
type LegacyWhiteboardSessionState = z.infer<typeof LegacyWhiteboardSessionStateSchema>
type WhiteboardLearnerEditRequest = z.infer<typeof WhiteboardLearnerEditRequestSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function formatElementLocation(index: number | undefined) {
  return index === undefined ? "Whiteboard element" : `Whiteboard element at index ${index}`
}

function requireElementString(input: {
  value: Record<string, unknown>
  key: string
  index: number | undefined
}): string {
  const value = input.value[input.key]
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  throw new WhiteboardElementValidationError(
    `${formatElementLocation(input.index)} must have a non-empty string ${input.key}.`,
  )
}

function requireElementNumber(input: {
  value: Record<string, unknown>
  key: string
  index: number | undefined
}): number {
  const value = input.value[input.key]
  if (isFiniteNumber(value)) {
    return value
  }
  throw new WhiteboardElementValidationError(
    `${formatElementLocation(input.index)} must have a finite number ${input.key}.`,
  )
}

function readLabelTextCandidate(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function readMalformedLabelTextFallback(label: Record<string, unknown>): string | undefined {
  return (
    readLabelTextCandidate(label.text) ??
    readLabelTextCandidate(label.value) ??
    readLabelTextCandidate(label.content) ??
    readLabelTextCandidate(label.title) ??
    readLabelTextCandidate(label.label)
  )
}

function normalizePersistableElementLabel(value: Record<string, unknown>): Record<string, unknown> {
  if (value.label === undefined) return value
  if (isRecord(value.label)) {
    const text = readMalformedLabelTextFallback(value.label)
    if (text) {
      return {
        ...value,
        label: {
          ...value.label,
          text,
        },
      }
    }
  }
  const text = readLabelTextCandidate(value.label)
  if (text) {
    return {
      ...value,
      label: { text },
    }
  }

  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "label"))
}

function parsePersistableWhiteboardElement(value: unknown, index?: number): WhiteboardElement {
  if (!isRecord(value)) {
    throw new WhiteboardElementValidationError(`${formatElementLocation(index)} must be an object.`)
  }

  const id = requireElementString({ value, key: "id", index })
  const type = requireElementString({ value, key: "type", index })
  if (!SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_SET.has(type)) {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} has unsupported type '${type}'. Supported drawn types: ${SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_LIST}. Keep cameraUpdate, delete, and translate as program instructions only; they are not stored canvas elements. Deprecated restoreCheckpoint and replaceCurrentBoard markers are accepted only as previous board-action controls.`,
    )
  }

  requireElementNumber({ value, key: "x", index })
  requireElementNumber({ value, key: "y", index })
  if (type === "text" && typeof value.text !== "string") {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} with type 'text' must include string text.`,
    )
  }

  return WhiteboardElementSchema.parse({
    ...normalizePersistableElementLabel(value),
    id,
    type,
  })
}

function sanitizeWhiteboardElements(elements: WhiteboardElement[]): WhiteboardElement[] {
  const sanitized: WhiteboardElement[] = []
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]
    try {
      sanitized.push(parsePersistableWhiteboardElement(element, index))
    } catch {
      continue
    }
  }
  return sanitized
}

export {
  WhiteboardBoundsSchema,
  WhiteboardBoardSchema,
  WhiteboardElementSchema,
  WhiteboardLearnerEditRequestSchema,
  WhiteboardModelContextSchema,
  WhiteboardRenderReportSaveResponseSchema,
  WhiteboardRenderReportSchema,
  LegacyWhiteboardSessionStateSchema,
  WhiteboardObjectBoardSchema,
  WhiteboardCreationReservationRequestSchema,
  WhiteboardCreationReservationResponseSchema,
  WhiteboardObjectReadSchema,
  WhiteboardObjectStateSchema,
  WhiteboardViewportSchema,
  parsePersistableWhiteboardElement,
  sanitizeWhiteboardElements,
}

export type {
  WhiteboardBoard,
  WhiteboardBoardOrigin,
  WhiteboardBounds,
  WhiteboardElement,
  WhiteboardLearnerEditRequest,
  WhiteboardModelContext,
  WhiteboardModelContextAnchor,
  WhiteboardRenderReport,
  WhiteboardRenderReportElement,
  WhiteboardRenderReportSaveResponse,
  LegacyWhiteboardSessionState,
  WhiteboardCreationReservationRequest,
  WhiteboardCreationReservationResponse,
  WhiteboardObjectBoard,
  WhiteboardObjectRead,
  WhiteboardObjectState,
  WhiteboardViewport,
}
