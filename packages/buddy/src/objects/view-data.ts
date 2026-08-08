import z from "zod"
import { BuddyObjectOriginSchema, BuddyObjectRefSchema, nonEmptyString } from "./manifest"
import { BUDDY_OBJECT_KINDS, BuddyObjectIDSchema } from "./kinds"

const HtmlWidgetInlineDataSchema = z
  .object({
    renderer: z.literal("html-widget"),
    runtimeUrl: nonEmptyString,
    sourceRoot: nonEmptyString,
    entryPath: nonEmptyString,
    sourceVersion: nonEmptyString.nullable(),
    viewportPreset: nonEmptyString,
  })
  .strict()

const BuddySourceRefDataSchema = z
  .object({
    role: z.enum(["original", "authoring", "payload", "external"]),
    path: nonEmptyString,
    displayPath: nonEmptyString.optional(),
    workspacePath: nonEmptyString.nullable().optional(),
    availability: z.enum(["available", "missing", "error"]),
  })
  .strict()

const MediaGalleryInlineItemSchema = z
  .object({
    itemID: nonEmptyString,
    title: nonEmptyString.nullable(),
    mediaType: nonEmptyString,
    mimeType: nonEmptyString.nullable(),
    source: BuddySourceRefDataSchema,
    availability: z.enum(["available", "missing", "error", "unavailable"]),
    rawUrl: nonEmptyString.nullable(),
    fileName: nonEmptyString.nullable(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    modifiedAt: nonEmptyString.nullable(),
  })
  .strict()

const MediaGalleryInlineDataSchema = z
  .object({
    renderer: z.literal("media-gallery"),
    layout: z.enum(["single", "grid", "strip"]),
    items: z.array(MediaGalleryInlineItemSchema),
  })
  .strict()

const MermaidInlineDataSchema = z
  .object({
    renderer: z.literal("mermaid"),
    source: nonEmptyString,
    svgUrl: nonEmptyString.nullable(),
    alt: nonEmptyString,
    caption: nonEmptyString.nullable(),
    renderStatus: z.enum(["ready", "stale", "error"]),
    failedRenderKey: nonEmptyString.nullable(),
  })
  .strict()

const FigureInlineDataSchema = z
  .object({
    renderer: z.literal("figure"),
    svgUrl: nonEmptyString.nullable(),
    source: nonEmptyString.nullable(),
    alt: nonEmptyString.nullable(),
    caption: nonEmptyString.nullable(),
    renderStatus: z.enum(["ready", "stale", "error"]),
  })
  .strict()

const QuestionSetGroupTypeSchema = z.enum(["quiz", "practice", "assessment"])

const QuestionSetInlineQuestionSchema = z
  .object({
    id: nonEmptyString,
    type: z.literal("mcq"),
    prompt: nonEmptyString,
    goalIds: z.array(nonEmptyString).min(1),
    explanation: nonEmptyString.optional(),
    payload: z
      .object({
        multipleSelect: z.boolean(),
        countChoices: z.boolean().optional(),
        numCorrect: z.number().int().positive().optional(),
        hasNoneOfTheAbove: z.boolean().optional(),
        randomize: z.boolean().optional(),
        choices: z
          .array(
            z
              .object({
                id: nonEmptyString,
                content: nonEmptyString,
                isNoneOfTheAbove: z.boolean().optional(),
              })
              .strict(),
          )
          .min(2),
      })
      .strict(),
  })
  .strict()

const QuestionSetInlineObjectSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    revisionID: BuddyObjectIDSchema,
    kind: z.literal(BUDDY_OBJECT_KINDS.questionSet),
    groupType: QuestionSetGroupTypeSchema,
    title: nonEmptyString,
    instructions: nonEmptyString.optional(),
    contextSummary: nonEmptyString.optional(),
    createdAt: nonEmptyString,
    createdBy: BuddyObjectOriginSchema,
    questions: z.array(QuestionSetInlineQuestionSchema).min(1),
  })
  .strict()

const QuestionSetInlineDataSchema = z
  .object({
    renderer: z.literal("question-set"),
    questionSet: QuestionSetInlineObjectSchema,
  })
  .strict()

const FlashcardDeckInlineDataSchema = z
  .object({
    renderer: z.literal("flashcard-deck"),
    title: nonEmptyString,
    noteCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
  })
  .strict()

const BuddyInlineViewDataSchema = z.discriminatedUnion("renderer", [
  HtmlWidgetInlineDataSchema,
  MediaGalleryInlineDataSchema,
  MermaidInlineDataSchema,
  FigureInlineDataSchema,
  QuestionSetInlineDataSchema,
  FlashcardDeckInlineDataSchema,
])

const BuddySourceViewDataSchema = z
  .object({
    renderer: z.literal("source"),
    sourceRoot: nonEmptyString,
    entryPath: nonEmptyString.nullable(),
    files: z.array(
      z
        .object({
          path: nonEmptyString,
          kind: z.enum(["file", "directory"]),
          sizeBytes: z.number().int().nonnegative().optional(),
          modifiedAt: nonEmptyString.optional(),
        })
        .strict(),
    ),
    content: z
      .object({
        path: nonEmptyString,
        text: z.string(),
        language: nonEmptyString.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()

const ResourceReaderViewDataSchema = z
  .object({
    renderer: z.literal("resource-reader"),
    objectID: nonEmptyString,
    alias: nonEmptyString,
    title: nonEmptyString,
    status: z.enum(["ready", "preparing", "stale", "unsupported", "error", "unavailable"]),
    sourceValidity: z.enum(["valid", "invalid", "unknown"]),
    extractionStatus: z.enum(["ready", "preparing", "stale", "unsupported", "error"]),
    readerPath: nonEmptyString.nullable(),
    packPath: nonEmptyString.nullable(),
    fullTextPath: nonEmptyString.nullable(),
    warnings: z.array(z.string()),
  })
  .strict()

const WhiteboardViewDataSchema = z
  .object({
    renderer: z.literal("whiteboard"),
    sessionID: nonEmptyString,
    boardID: nonEmptyString.nullable(),
    continuationHandle: z.literal("current"),
    elementCount: z.number().int().nonnegative(),
  })
  .strict()

const BuddyContextViewDataSchema = z
  .object({
    renderer: z.literal("context"),
    content: z.string(),
    refs: z.array(
      z
        .object({
          label: nonEmptyString,
          value: nonEmptyString,
        })
        .strict(),
    ),
  })
  .strict()

const BuddyLibraryViewDataSchema = z
  .object({
    renderer: z.literal("library"),
    title: nonEmptyString,
    subtitle: nonEmptyString.nullable(),
    badge: nonEmptyString.nullable(),
    thumbnailUrl: nonEmptyString.nullable(),
    metrics: z.array(
      z
        .object({
          label: nonEmptyString,
          value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
        })
        .strict(),
    ),
  })
  .strict()

const BuddyObjectViewDataSchema = z.discriminatedUnion("renderer", [
  HtmlWidgetInlineDataSchema,
  MediaGalleryInlineDataSchema,
  MermaidInlineDataSchema,
  FigureInlineDataSchema,
  QuestionSetInlineDataSchema,
  FlashcardDeckInlineDataSchema,
  ResourceReaderViewDataSchema,
  WhiteboardViewDataSchema,
  BuddySourceViewDataSchema,
  BuddyContextViewDataSchema,
  BuddyLibraryViewDataSchema,
])

const BuddyObjectViewResponseSchema = z
  .object({
    ref: BuddyObjectRefSchema,
    viewID: nonEmptyString,
    title: nonEmptyString,
    data: BuddyObjectViewDataSchema,
  })
  .strict()

type HtmlWidgetInlineData = z.infer<typeof HtmlWidgetInlineDataSchema>
type MediaGalleryInlineData = z.infer<typeof MediaGalleryInlineDataSchema>
type MermaidInlineData = z.infer<typeof MermaidInlineDataSchema>
type FigureInlineData = z.infer<typeof FigureInlineDataSchema>
type QuestionSetInlineData = z.infer<typeof QuestionSetInlineDataSchema>
type FlashcardDeckInlineData = z.infer<typeof FlashcardDeckInlineDataSchema>
type ResourceReaderViewData = z.infer<typeof ResourceReaderViewDataSchema>
type WhiteboardViewData = z.infer<typeof WhiteboardViewDataSchema>
type BuddyInlineViewData = z.infer<typeof BuddyInlineViewDataSchema>
type BuddyObjectViewData = z.infer<typeof BuddyObjectViewDataSchema>
type BuddyObjectViewResponse = z.infer<typeof BuddyObjectViewResponseSchema>

export {
  BuddyContextViewDataSchema,
  BuddyInlineViewDataSchema,
  BuddyLibraryViewDataSchema,
  BuddyObjectViewDataSchema,
  BuddyObjectViewResponseSchema,
  BuddySourceViewDataSchema,
  FigureInlineDataSchema,
  FlashcardDeckInlineDataSchema,
  HtmlWidgetInlineDataSchema,
  MediaGalleryInlineDataSchema,
  MermaidInlineDataSchema,
  QuestionSetInlineDataSchema,
  QuestionSetGroupTypeSchema,
  QuestionSetInlineObjectSchema,
  QuestionSetInlineQuestionSchema,
  ResourceReaderViewDataSchema,
  WhiteboardViewDataSchema,
}
export type {
  BuddyInlineViewData,
  BuddyObjectViewData,
  BuddyObjectViewResponse,
  FigureInlineData,
  FlashcardDeckInlineData,
  HtmlWidgetInlineData,
  MediaGalleryInlineData,
  MermaidInlineData,
  QuestionSetInlineData,
  ResourceReaderViewData,
  WhiteboardViewData,
}
