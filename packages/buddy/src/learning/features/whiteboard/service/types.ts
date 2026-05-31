import z from "zod"
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

const WhiteboardRevisionOriginSchema = z.enum(["agent", "learner", "new-scene"])

const WhiteboardRevisionSchema = z
  .object({
    revisionID: z.string().trim().min(1),
    sceneID: z.string().trim().min(1),
    origin: WhiteboardRevisionOriginSchema,
    createdAt: z.string().datetime(),
    elements: z.array(WhiteboardElementSchema),
    viewport: WhiteboardViewportSchema.optional(),
  })
  .strict()

const WhiteboardRevisionSummarySchema = WhiteboardRevisionSchema.pick({
  revisionID: true,
  origin: true,
  createdAt: true,
}).extend({
  elementCount: z.number().int().nonnegative(),
})

const WhiteboardSceneSchema = z
  .object({
    sceneID: z.string().trim().min(1),
    headRevisionID: z.string().trim().min(1),
    revisionIDs: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()

const WhiteboardSessionStateSchema = z
  .object({
    version: z.literal(1),
    sessionID: z.string().trim().min(1),
    activeSceneID: z.string().trim().min(1).optional(),
    scenes: z.record(z.string(), WhiteboardSceneSchema),
    revisions: z.record(z.string(), WhiteboardRevisionSchema),
  })
  .strict()

const WhiteboardActiveSceneSchema = z
  .object({
    sceneID: z.string().trim().min(1),
    continuationHandle: z.string().trim().min(1),
    headRevisionID: z.string().trim().min(1),
    revisionCount: z.number().int().positive(),
    revisions: z.array(WhiteboardRevisionSummarySchema),
    latestRevision: WhiteboardRevisionSchema,
  })
  .strict()

const WhiteboardSessionReadSchema = z
  .object({
    activeScene: WhiteboardActiveSceneSchema.nullable(),
  })
  .strict()

const WhiteboardLearnerEditRequestSchema = z
  .object({
    baseRevisionID: z.string().trim().min(1),
    elements: z.array(WhiteboardElementSchema),
    viewport: WhiteboardViewportSchema.optional(),
  })
  .strict()

type WhiteboardElement = z.infer<typeof WhiteboardElementSchema>
type WhiteboardViewport = z.infer<typeof WhiteboardViewportSchema>
type WhiteboardRevision = z.infer<typeof WhiteboardRevisionSchema>
type WhiteboardRevisionOrigin = z.infer<typeof WhiteboardRevisionOriginSchema>
type WhiteboardRevisionSummary = z.infer<typeof WhiteboardRevisionSummarySchema>
type WhiteboardScene = z.infer<typeof WhiteboardSceneSchema>
type WhiteboardSessionState = z.infer<typeof WhiteboardSessionStateSchema>
type WhiteboardActiveScene = z.infer<typeof WhiteboardActiveSceneSchema>
type WhiteboardSessionRead = z.infer<typeof WhiteboardSessionReadSchema>
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

function normalizePersistableElementLabel(
  value: Record<string, unknown>,
): Record<string, unknown> {
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
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} must be an object.`,
    )
  }

  const id = requireElementString({ value, key: "id", index })
  const type = requireElementString({ value, key: "type", index })
  if (!SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_SET.has(type)) {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} has unsupported type '${type}'. Supported drawn types: ${SUPPORTED_WHITEBOARD_DRAWN_ELEMENT_TYPE_LIST}. Keep cameraUpdate, restoreCheckpoint, delete, update, translate, and layoutCleanup as program instructions only; they are not stored canvas elements.`,
    )
  }

  requireElementNumber({ value, key: "x", index })
  requireElementNumber({ value, key: "y", index })
  if (type !== "text") {
    requireElementNumber({ value, key: "width", index })
    requireElementNumber({ value, key: "height", index })
  }
  if (type === "text" && typeof value.text !== "string") {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} with type 'text' must include string text.`,
    )
  }
  if (type === "freedraw" && !Array.isArray(value.points)) {
    throw new WhiteboardElementValidationError(
      `${formatElementLocation(index)} with type 'freedraw' must include a points array.`,
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
  WhiteboardActiveSceneSchema,
  WhiteboardElementSchema,
  WhiteboardLearnerEditRequestSchema,
  WhiteboardRevisionSchema,
  WhiteboardRevisionSummarySchema,
  WhiteboardSessionReadSchema,
  WhiteboardSessionStateSchema,
  WhiteboardViewportSchema,
  parsePersistableWhiteboardElement,
  sanitizeWhiteboardElements,
}

export type {
  WhiteboardActiveScene,
  WhiteboardElement,
  WhiteboardLearnerEditRequest,
  WhiteboardRevision,
  WhiteboardRevisionOrigin,
  WhiteboardRevisionSummary,
  WhiteboardScene,
  WhiteboardSessionRead,
  WhiteboardSessionState,
  WhiteboardViewport,
}
