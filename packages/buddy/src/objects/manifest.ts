import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectKindSchema,
  OBJECT_MANIFEST_VERSION,
} from "./kinds"

const nonEmptyString = z.string().trim().min(1)
const timestampString = z.string().datetime()

const BuddyObjectLifecycleSchema = z.enum([
  "revisioned",
  "live",
  "imported",
  "external-reference",
])

const BuddyObjectStatusSchema = z.enum([
  "ready",
  "preparing",
  "stale",
  "unsupported",
  "error",
  "unavailable",
])

const BuddyObjectSurfaceSchema = z.enum(["inline", "bench", "library", "context", "source"])

const BuddyObjectSourceRefSchema = z
  .object({
    role: z.enum(["original", "authoring", "payload", "external"]),
    path: nonEmptyString,
    displayPath: nonEmptyString.optional(),
    workspacePath: nonEmptyString.nullable().optional(),
    mutable: z.boolean(),
    copied: z.boolean(),
    availability: z.enum(["available", "missing", "error"]),
    exists: z.boolean().optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    modifiedAt: timestampString.optional(),
  })
  .strict()

const BuddyToolOriginSchema = z
  .object({
    kind: z.literal("tool"),
    sessionID: nonEmptyString,
    messageID: nonEmptyString,
    callID: nonEmptyString,
    subagent: nonEmptyString.optional(),
  })
  .strict()

const BuddyMarkdownOriginSchema = z
  .object({
    kind: z.literal("markdown"),
    sessionID: nonEmptyString,
    messageID: nonEmptyString,
    partID: nonEmptyString,
    segmentIndex: z.number().int().nonnegative(),
  })
  .strict()

const BuddyImportOriginSchema = z
  .object({
    kind: z.literal("import"),
    sourcePath: nonEmptyString,
  })
  .strict()

const BuddyAppOriginSchema = z
  .object({
    kind: z.literal("app"),
    reason: nonEmptyString,
  })
  .strict()

const BuddyObjectOriginSchema = z.discriminatedUnion("kind", [
  BuddyToolOriginSchema,
  BuddyMarkdownOriginSchema,
  BuddyImportOriginSchema,
  BuddyAppOriginSchema,
])

const BuddyViewAvailabilitySchema = z
  .object({
    status: z.enum(["available", "unavailable", "stale", "error"]),
    reason: nonEmptyString.optional(),
  })
  .strict()

const HtmlWidgetInlineViewParamsSchema = z
  .object({
    renderer: z.literal("html-widget"),
    entryPath: nonEmptyString,
    viewportPreset: nonEmptyString,
  })
  .strict()

const MediaGalleryInlineViewParamsSchema = z
  .object({
    renderer: z.literal("media-gallery"),
    layout: z.enum(["single", "grid", "strip"]),
  })
  .strict()

const MermaidInlineViewParamsSchema = z
  .object({
    renderer: z.literal("mermaid"),
    diagramType: nonEmptyString.nullable(),
  })
  .strict()

const FigureInlineViewParamsSchema = z
  .object({
    renderer: z.literal("figure"),
    figureKind: z.enum(["geometry", "freeform"]),
  })
  .strict()

const QuestionSetInlineViewParamsSchema = z
  .object({
    renderer: z.literal("question-set"),
    groupType: nonEmptyString.nullable(),
  })
  .strict()

const FlashcardDeckInlineViewParamsSchema = z
  .object({
    renderer: z.literal("flashcard-deck"),
    noteCount: z.number().int().nonnegative(),
  })
  .strict()

const BuddyInlineRendererSchema = z.enum([
  "html-widget",
  "media-gallery",
  "mermaid",
  "figure",
  "question-set",
  "flashcard-deck",
])

const BuddyInlineViewParamsSchema = z.discriminatedUnion("renderer", [
  HtmlWidgetInlineViewParamsSchema,
  MediaGalleryInlineViewParamsSchema,
  MermaidInlineViewParamsSchema,
  FigureInlineViewParamsSchema,
  QuestionSetInlineViewParamsSchema,
  FlashcardDeckInlineViewParamsSchema,
])

const BuddyInlineViewDescriptorSchema = z
  .object({
    renderer: BuddyInlineRendererSchema,
    params: BuddyInlineViewParamsSchema,
  })
  .strict()

const BuddyBenchViewDescriptorSchema = z
  .object({
    resolver: z.literal("object-view"),
  })
  .strict()

const BuddyLibraryViewDescriptorSchema = z
  .object({
    section: z.enum(["resources", "widgets", "media", "diagrams", "practice", "flashcards"]),
  })
  .strict()

const BuddyContextViewDescriptorSchema = z
  .object({
    toolID: nonEmptyString,
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

const BuddySourceViewDescriptorSchema = z
  .object({
    sourceRoot: nonEmptyString,
    entryPath: nonEmptyString.optional(),
  })
  .strict()

const BuddyObjectViewDescriptorSchema = z
  .object({
    viewID: nonEmptyString,
    label: nonEmptyString,
    surfaces: z.array(BuddyObjectSurfaceSchema),
    availability: BuddyViewAvailabilitySchema,
    inline: BuddyInlineViewDescriptorSchema.optional(),
    bench: BuddyBenchViewDescriptorSchema.optional(),
    library: BuddyLibraryViewDescriptorSchema.optional(),
    context: BuddyContextViewDescriptorSchema.optional(),
    source: BuddySourceViewDescriptorSchema.optional(),
  })
  .strict()

const ResourceObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.resource),
    alias: nonEmptyString,
    format: nonEmptyString,
    generationID: nonEmptyString.nullable(),
    preparedAt: timestampString.nullable(),
    fullTextPath: nonEmptyString.nullable(),
    fullTextEstimatedTokens: z.number().int().nonnegative().nullable(),
    fullTextCharacters: z.number().int().nonnegative().nullable(),
    readerPath: nonEmptyString.nullable(),
    warnings: z.array(z.string()),
  })
  .strict()

const WhiteboardObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.whiteboard),
    sessionID: nonEmptyString,
    boardID: nonEmptyString.nullable(),
    continuationHandle: z.literal("current"),
  })
  .strict()

const HtmlWidgetObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.htmlWidget),
    entryPath: nonEmptyString,
    viewportPreset: nonEmptyString,
    sourceVersion: nonEmptyString.nullable(),
    warnings: z.array(z.string()),
  })
  .strict()

const MermaidObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.mermaid),
    alt: nonEmptyString,
    caption: nonEmptyString.nullable(),
    diagramType: nonEmptyString.nullable(),
    renderStatus: z.enum(["ready", "stale", "error"]),
    repairOfObjectID: BuddyObjectIDSchema.nullable(),
    supersedesRevisionID: BuddyObjectIDSchema.nullable(),
    replacementRevisionID: BuddyObjectIDSchema.nullable(),
  })
  .strict()

const FigureObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.figure),
    caption: nonEmptyString.nullable(),
    renderStatus: z.enum(["ready", "stale", "error"]),
  })
  .strict()

const FreeformFigureObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.freeformFigure),
    caption: nonEmptyString.nullable(),
    renderStatus: z.enum(["ready", "stale", "error"]),
  })
  .strict()

const MediaPresentationObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.mediaPresentation),
    layout: z.enum(["single", "grid", "strip"]),
    itemCount: z.number().int().nonnegative(),
  })
  .strict()

const QuestionSetObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.questionSet),
    groupType: nonEmptyString.nullable(),
    questionCount: z.number().int().nonnegative(),
  })
  .strict()

const FlashcardDeckObjectSummarySchema = z
  .object({
    kind: z.literal(BUDDY_OBJECT_KINDS.flashcardDeck),
    noteCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
  })
  .strict()

const BuddyObjectSummarySchema = z.discriminatedUnion("kind", [
  ResourceObjectSummarySchema,
  WhiteboardObjectSummarySchema,
  HtmlWidgetObjectSummarySchema,
  MermaidObjectSummarySchema,
  FigureObjectSummarySchema,
  FreeformFigureObjectSummarySchema,
  MediaPresentationObjectSummarySchema,
  QuestionSetObjectSummarySchema,
  FlashcardDeckObjectSummarySchema,
])

const BuddyObjectManifestSchema = z
  .object({
    version: z.literal(OBJECT_MANIFEST_VERSION),
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    title: nonEmptyString,
    description: nonEmptyString.optional(),
    status: BuddyObjectStatusSchema,
    lifecycle: BuddyObjectLifecycleSchema,
    currentRevisionID: BuddyObjectIDSchema.optional(),
    createdAt: timestampString,
    updatedAt: timestampString,
    origin: BuddyObjectOriginSchema.optional(),
    sourceRefs: z.array(BuddyObjectSourceRefSchema),
    views: z.array(BuddyObjectViewDescriptorSchema),
    summary: BuddyObjectSummarySchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.kind !== manifest.summary.kind) {
      ctx.addIssue({
        code: "custom",
        path: ["summary", "kind"],
        message: "Object summary kind must match manifest kind.",
      })
    }
  })

const BuddyObjectRefSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    revisionID: nonEmptyString.nullable(),
    itemID: nonEmptyString.nullable(),
  })
  .strict()

const BuddyObjectTombstoneSchema = z
  .object({
    version: z.literal(OBJECT_MANIFEST_VERSION),
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    deletedAt: timestampString,
    title: nonEmptyString.optional(),
    reason: z.enum(["user_deleted", "source_unavailable"]).optional(),
  })
  .strict()

const BuddyObjectIndexItemSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    title: nonEmptyString,
    status: BuddyObjectStatusSchema,
    lifecycle: BuddyObjectLifecycleSchema,
    sourceRoot: nonEmptyString.nullable(),
    primaryViewID: nonEmptyString.nullable(),
    surfaces: z.array(BuddyObjectSurfaceSchema),
    hasLibraryView: z.boolean(),
    updatedAt: timestampString,
  })
  .strict()

const BuddyObjectLoadErrorSchema = z
  .object({
    kind: BuddyObjectKindSchema.nullable(),
    objectID: BuddyObjectIDSchema.nullable(),
    path: nonEmptyString,
    message: nonEmptyString,
  })
  .strict()

const BuddyObjectReadResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      manifest: BuddyObjectManifestSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      tombstone: BuddyObjectTombstoneSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      loadError: BuddyObjectLoadErrorSchema,
    })
    .strict(),
])

type BuddyObjectLifecycle = z.infer<typeof BuddyObjectLifecycleSchema>
type BuddyObjectStatus = z.infer<typeof BuddyObjectStatusSchema>
type BuddyObjectSurface = z.infer<typeof BuddyObjectSurfaceSchema>
type BuddyObjectSourceRef = z.infer<typeof BuddyObjectSourceRefSchema>
type BuddyObjectOrigin = z.infer<typeof BuddyObjectOriginSchema>
type BuddyObjectViewDescriptor = z.infer<typeof BuddyObjectViewDescriptorSchema>
type BuddyObjectSummary = z.infer<typeof BuddyObjectSummarySchema>
type BuddyObjectManifest = z.infer<typeof BuddyObjectManifestSchema>
type BuddyObjectRef = z.infer<typeof BuddyObjectRefSchema>
type BuddyObjectTombstone = z.infer<typeof BuddyObjectTombstoneSchema>
type BuddyObjectIndexItem = z.infer<typeof BuddyObjectIndexItemSchema>
type BuddyObjectLoadError = z.infer<typeof BuddyObjectLoadErrorSchema>
type BuddyObjectReadResponse = z.infer<typeof BuddyObjectReadResponseSchema>

export {
  BuddyObjectIndexItemSchema,
  BuddyObjectLifecycleSchema,
  BuddyObjectLoadErrorSchema,
  BuddyObjectManifestSchema,
  BuddyObjectOriginSchema,
  BuddyObjectReadResponseSchema,
  BuddyObjectRefSchema,
  BuddyObjectSourceRefSchema,
  BuddyObjectStatusSchema,
  BuddyObjectSummarySchema,
  BuddyObjectSurfaceSchema,
  BuddyObjectTombstoneSchema,
  BuddyObjectViewDescriptorSchema,
  FlashcardDeckObjectSummarySchema,
  FigureObjectSummarySchema,
  FreeformFigureObjectSummarySchema,
  HtmlWidgetObjectSummarySchema,
  MediaPresentationObjectSummarySchema,
  MermaidObjectSummarySchema,
  QuestionSetObjectSummarySchema,
  ResourceObjectSummarySchema,
  WhiteboardObjectSummarySchema,
  nonEmptyString,
  timestampString,
}
export type {
  BuddyObjectIndexItem,
  BuddyObjectLifecycle,
  BuddyObjectLoadError,
  BuddyObjectManifest,
  BuddyObjectOrigin,
  BuddyObjectReadResponse,
  BuddyObjectRef,
  BuddyObjectSourceRef,
  BuddyObjectStatus,
  BuddyObjectSummary,
  BuddyObjectSurface,
  BuddyObjectTombstone,
  BuddyObjectViewDescriptor,
}
