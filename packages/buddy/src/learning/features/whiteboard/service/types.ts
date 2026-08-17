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

const jsonStringSchema = z.string()
const jsonFiniteNumberSchema = z.number().finite()
const jsonBooleanSchema = z.boolean()
// Origin guarded elements with a plain isRecord check and never inspected property values, so
// every key survived. z.json() rejects keys holding undefined and non-finite numbers, both of
// which live Excalidraw elements carry, and rejecting one key rejects the whole element. Accept
// the same value range origin did so no key is lost.
const jsonValueSchema: z.ZodType<TJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.nan(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)
const jsonObjectSchema: z.ZodType<TJsonObject> = z.record(z.string(), jsonValueSchema)

type TJsonValue = string | number | boolean | null | undefined | TJsonValue[] | TJsonObject
type TJsonObject = { [key: string]: TJsonValue }

function parseTString<TValue>(value: TValue): string | undefined {
  const parsed = jsonStringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTFiniteNumber<TValue>(value: TValue): number | undefined {
  const parsed = jsonFiniteNumberSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTBoolean<TValue>(value: TValue): boolean | undefined {
  const parsed = jsonBooleanSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseNonEmptyTString<TValue>(value: TValue): string | undefined {
  const parsed = parseTString(value)
  if (parsed === undefined || parsed.trim().length === 0) return undefined
  return parsed
}

const WhiteboardElementSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().trim().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    text: z.string().optional(),
    originalText: z.string().optional(),
    // Excalidraw persists these as null when a text element or arrow end is unbound.
    // Accept null at the I/O boundary and normalize it to undefined so the domain type
    // stays `string | undefined` for every reader of a parsed element.
    // Sync with packages/web/src/components/whiteboard/whiteboard-elements.ts.
    // Kept nullable rather than normalized to undefined: a transform would leave an own key
    // holding undefined, which the JSON record parse in parsePersistableWhiteboardElement
    // rejects. Readers coalesce with `?? undefined`, matching whiteboard-elements.ts.
    containerId: z.string().nullable().optional(),
    label: z.union([z.string(), jsonObjectSchema]).nullable().optional(),
    startBinding: jsonObjectSchema.nullable().optional(),
    endBinding: jsonObjectSchema.nullable().optional(),
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

function formatElementLocation(index: number | undefined) {
  return index === undefined ? "Whiteboard element" : `Whiteboard element at index ${index}`
}

/**
 * Excalidraw persists an unbound container as null, so null and absent mean the same thing.
 * Mirrors readRenderedElementContainerID in packages/web/src/components/whiteboard/whiteboard-elements.ts.
 */
function readElementContainerID(element: WhiteboardElement): string | undefined {
  return element.containerId ?? undefined
}

function requireElementString(input: {
  value: TJsonObject
  key: string
  index: number | undefined
}): string {
  const value = parseNonEmptyTString(input.value[input.key])
  if (value !== undefined) return value
  throw new WhiteboardElementValidationError(
    `${formatElementLocation(input.index)} must have a non-empty string ${input.key}.`,
  )
}

function requireElementNumber(input: {
  value: TJsonObject
  key: string
  index: number | undefined
}): number {
  const value = parseTFiniteNumber(input.value[input.key])
  if (value !== undefined) return value
  throw new WhiteboardElementValidationError(
    `${formatElementLocation(input.index)} must have a finite number ${input.key}.`,
  )
}

function readLabelTextCandidate<TValue>(value: TValue): string | undefined {
  const text = parseNonEmptyTString(value)
  if (text !== undefined) return text
  const numeric = parseTFiniteNumber(value)
  if (numeric !== undefined) return String(numeric)
  const flag = parseTBoolean(value)
  if (flag !== undefined) return String(flag)
  return undefined
}

function readMalformedLabelTextFallback(label: TJsonObject): string | undefined {
  return (
    readLabelTextCandidate(label.text) ??
    readLabelTextCandidate(label.value) ??
    readLabelTextCandidate(label.content) ??
    readLabelTextCandidate(label.title) ??
    readLabelTextCandidate(label.label)
  )
}

function normalizePersistableElementLabel(value: TJsonObject) {
  if (value.label === undefined) return value
  const labelObject = parseTJsonObject(value.label)
  if (labelObject !== undefined) {
    const text = readMalformedLabelTextFallback(labelObject)
    if (text) {
      return {
        ...value,
        label: {
          ...labelObject,
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

function parsePersistableWhiteboardElement<TValue>(
  value: TValue,
  index?: number,
): WhiteboardElement {
  const record = parseTJsonObject(value)
  if (record === undefined) {
    throw new WhiteboardElementValidationError(`${formatElementLocation(index)} must be an object.`)
  }

  const id = requireElementString({ value: record, key: "id", index })
  const type = requireElementString({ value: record, key: "type", index })
  if (!SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_SET.has(type)) {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} has unsupported type '${type}'. Supported drawn types: ${SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_LIST}. Keep cameraUpdate, delete, and translate as program instructions only; they are not stored canvas elements. Deprecated restoreCheckpoint and replaceCurrentBoard markers are accepted only as previous board-action controls.`,
    )
  }

  requireElementNumber({ value: record, key: "x", index })
  requireElementNumber({ value: record, key: "y", index })
  if (type === "text" && parseTString(record.text) === undefined) {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} with type 'text' must include string text.`,
    )
  }

  return WhiteboardElementSchema.parse({
    ...normalizePersistableElementLabel(record),
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
  readElementContainerID,
  parseNonEmptyTString,
  parseTFiniteNumber,
  parseTJsonObject,
  parseTString,
  sanitizeWhiteboardElements,
}

export type {
  TJsonObject,
  TJsonValue,
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
