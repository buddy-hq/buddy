import z from "zod"
import {
  FigureArtifactManifestSchema,
  FigureSummarySchema,
} from "./features/figure-rendering/geometry/types"
import {
  FreeformFigureArtifactManifestSchema,
  FreeformFigureSummarySchema,
} from "./features/figure-rendering/freeform/types"
import {
  MermaidArtifactManifestSchema,
  MermaidAutoRepairStateSchema,
} from "./features/diagrams/service/types"
import { listQuestionSetArtifactSummaries } from "./features/question-sets/storage/read-artifact"
import { listFlashcardDeckIndexItems } from "./features/flashcards/storage/read-deck"
import {
  buildHtmlWidgetRuntimeUrl,
  buildHtmlWidgetSourceUrl,
} from "./features/html-widgets/service/store"
import { HtmlWidgetArtifactManifestSchema } from "./features/html-widgets/service/types"
import {
  PresentedMediaSummarySchema,
  listPresentedMediaArtifactSummaries,
} from "./features/media-presentations/service/file-media"
import {
  ARTIFACT_KINDS,
  ArtifactIDSchema,
  ArtifactKindSchema,
  SourceHashSchema,
} from "../artifacts/kinds"
import { ArtifactOriginSchema } from "../artifacts/manifest"
import { listArtifactManifests, readArtifactManifest } from "../artifacts/store"

const artifactLoadErrorSchema = z.object({
  artifactID: z.string().min(1),
  kind: ArtifactKindSchema,
  message: z.string().min(1),
})

const artifactIndexBaseSchema = z.object({
  artifactID: ArtifactIDSchema,
  kind: ArtifactKindSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  origin: ArtifactOriginSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceHash: SourceHashSchema.optional(),
})

const mermaidIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.mermaid),
  summary: z.object({
    diagramType: z.string().min(1),
    alt: z.string().min(1),
    caption: z.string().min(1).optional(),
    autoRepair: MermaidAutoRepairStateSchema,
    supersedesArtifactID: ArtifactIDSchema.optional(),
  }),
})

const questionSetIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.questionSet),
  summary: z.object({
    groupType: z.enum(["quiz", "practice", "assessment"]),
    questionCount: z.number().int().positive(),
    instructions: z.string().min(1).optional(),
    contextSummary: z.string().min(1).optional(),
  }),
})

const flashcardDeckIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.flashcardDeck),
  summary: z.object({
    noteCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
    dueCounts: z.object({
      new: z.number().int().nonnegative(),
      learning: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
    }),
    reviewAvailable: z.boolean(),
  }),
})

const htmlWidgetIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.htmlWidget),
  summary: z.object({
    viewport: z.object({
      preset: z.enum(["compact_4_3", "standard_16_10", "wide_16_9", "square", "tall_mobile"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      label: z.string().min(1),
    }),
    runtimeUrl: z.string().min(1),
    sourceUrl: z.string().min(1),
    sourcePath: z.string().min(1).optional(),
    warningCount: z.number().int().nonnegative(),
  }),
})

const mediaPresentationIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.mediaPresentation),
  summary: PresentedMediaSummarySchema,
})

const figureIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.figure),
  summary: FigureSummarySchema,
})

const freeformFigureIndexArtifactSchema = artifactIndexBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.freeformFigure),
  summary: FreeformFigureSummarySchema,
})

const artifactIndexItemSchema = z.discriminatedUnion("kind", [
  mermaidIndexArtifactSchema,
  questionSetIndexArtifactSchema,
  flashcardDeckIndexArtifactSchema,
  htmlWidgetIndexArtifactSchema,
  mediaPresentationIndexArtifactSchema,
  figureIndexArtifactSchema,
  freeformFigureIndexArtifactSchema,
])

const artifactIndexResponseSchema = z.object({
  artifacts: z.array(artifactIndexItemSchema),
  loadErrors: z.array(artifactLoadErrorSchema),
})

const figureReadResponseBaseSchema = z.object({
  artifactID: ArtifactIDSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceHash: SourceHashSchema,
  rawUrl: z.string().min(1),
})

const figureReadResponseSchema = figureReadResponseBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.figure),
  summary: FigureSummarySchema,
})

const freeformFigureReadResponseSchema = figureReadResponseBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.freeformFigure),
  summary: FreeformFigureSummarySchema,
})

type ArtifactIndexItem = z.infer<typeof artifactIndexItemSchema>
type ArtifactIndexKind = z.infer<typeof ArtifactKindSchema>
type ArtifactLoadError = z.infer<typeof artifactLoadErrorSchema>

function loadErrorItems(
  values: Array<{ artifactID: string; kind: string; message: string }>,
): ArtifactLoadError[] {
  return values.flatMap((value) => {
    const parsed = artifactLoadErrorSchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  })
}

async function listMermaidIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.mermaid,
    schema: MermaidArtifactManifestSchema,
  })
  const supersededArtifactIDs = new Set(
    result.items.flatMap((artifact) =>
      artifact.summary.supersedesArtifactID ? [artifact.summary.supersedesArtifactID] : [],
    ),
  )
  return {
    artifacts: result.items.flatMap((artifact) => {
      if (supersededArtifactIDs.has(artifact.artifactID)) {
        return []
      }
      return mermaidIndexArtifactSchema.parse({
        artifactID: artifact.artifactID,
        kind: ARTIFACT_KINDS.mermaid,
        title: artifact.title,
        ...(artifact.description ? { description: artifact.description } : {}),
        origin: artifact.origin,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        sourceHash: artifact.sourceHash,
        summary: {
          diagramType: artifact.summary.diagramType,
          alt: artifact.summary.alt,
          ...(artifact.summary.caption ? { caption: artifact.summary.caption } : {}),
          autoRepair: artifact.summary.autoRepair,
          ...(artifact.summary.supersedesArtifactID
            ? { supersedesArtifactID: artifact.summary.supersedesArtifactID }
            : {}),
        },
      })
    }),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listQuestionSetIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listQuestionSetArtifactSummaries(directory)
  return {
    artifacts: result.artifacts.map((artifact) =>
      questionSetIndexArtifactSchema.parse({
        artifactID: artifact.artifactID,
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.description ? { description: artifact.description } : {}),
        origin: artifact.origin,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        summary: artifact.summary,
      }),
    ),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listFlashcardIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listFlashcardDeckIndexItems(directory)
  return {
    artifacts: result.items.map((deck) =>
      flashcardDeckIndexArtifactSchema.parse({
        artifactID: deck.artifactID,
        kind: deck.kind,
        title: deck.title,
        origin: deck.createdBy,
        createdAt: deck.createdAt,
        updatedAt: deck.createdAt,
        summary: {
          noteCount: deck.noteCount,
          cardCount: deck.cardCount,
          dueCounts: deck.dueCounts,
          reviewAvailable: deck.reviewAvailable,
        },
      }),
    ),
    loadErrors: loadErrorItems(
      result.loadErrors.map((loadError) => ({
        artifactID: loadError.artifactID,
        kind: ARTIFACT_KINDS.flashcardDeck,
        message: loadError.message,
      })),
    ),
  }
}

async function listHtmlWidgetIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.htmlWidget,
    schema: HtmlWidgetArtifactManifestSchema,
  })
  return {
    artifacts: result.items.map((widget) =>
      htmlWidgetIndexArtifactSchema.parse({
        artifactID: widget.artifactID,
        kind: widget.kind,
        title: widget.title,
        ...(widget.description ? { description: widget.description } : {}),
        origin: widget.origin,
        createdAt: widget.createdAt,
        updatedAt: widget.updatedAt,
        sourceHash: widget.sourceHash,
        summary: {
          viewport: widget.summary.viewport,
          runtimeUrl: buildHtmlWidgetRuntimeUrl({
            directory,
            artifactID: widget.artifactID,
          }),
          sourceUrl: buildHtmlWidgetSourceUrl({
            directory,
            artifactID: widget.artifactID,
          }),
          ...(widget.summary.sourcePath ? { sourcePath: widget.summary.sourcePath } : {}),
          warningCount: widget.summary.warnings.length,
        },
      }),
    ),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listMediaIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listPresentedMediaArtifactSummaries(directory)
  return {
    artifacts: result.artifacts.map((artifact) =>
      mediaPresentationIndexArtifactSchema.parse({
        artifactID: artifact.artifactID,
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.description ? { description: artifact.description } : {}),
        origin: artifact.origin,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        summary: artifact.summary,
      }),
    ),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listFigureIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.figure,
    schema: FigureArtifactManifestSchema,
  })
  return {
    artifacts: result.items.map((artifact) =>
      figureIndexArtifactSchema.parse({
        artifactID: artifact.artifactID,
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.description ? { description: artifact.description } : {}),
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        sourceHash: artifact.sourceHash,
        summary: artifact.summary,
      }),
    ),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listFreeformFigureIndexArtifacts(directory: string): Promise<{
  artifacts: ArtifactIndexItem[]
  loadErrors: ArtifactLoadError[]
}> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.freeformFigure,
    schema: FreeformFigureArtifactManifestSchema,
  })
  return {
    artifacts: result.items.map((artifact) =>
      freeformFigureIndexArtifactSchema.parse({
        artifactID: artifact.artifactID,
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.description ? { description: artifact.description } : {}),
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        sourceHash: artifact.sourceHash,
        summary: artifact.summary,
      }),
    ),
    loadErrors: loadErrorItems(result.loadErrors),
  }
}

async function listArtifactIndex(input: {
  directory: string
  kind?: ArtifactIndexKind
}): Promise<z.infer<typeof artifactIndexResponseSchema>> {
  const loaders = [
    { kind: ARTIFACT_KINDS.mermaid, load: listMermaidIndexArtifacts },
    { kind: ARTIFACT_KINDS.questionSet, load: listQuestionSetIndexArtifacts },
    { kind: ARTIFACT_KINDS.flashcardDeck, load: listFlashcardIndexArtifacts },
    { kind: ARTIFACT_KINDS.htmlWidget, load: listHtmlWidgetIndexArtifacts },
    { kind: ARTIFACT_KINDS.mediaPresentation, load: listMediaIndexArtifacts },
    { kind: ARTIFACT_KINDS.figure, load: listFigureIndexArtifacts },
    { kind: ARTIFACT_KINDS.freeformFigure, load: listFreeformFigureIndexArtifacts },
  ].filter((loader) => !input.kind || loader.kind === input.kind)

  const results = await Promise.all(loaders.map((loader) => loader.load(input.directory)))
  return artifactIndexResponseSchema.parse({
    artifacts: results
      .flatMap((result) => result.artifacts)
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)),
    loadErrors: results
      .flatMap((result) => result.loadErrors)
      .toSorted((left, right) => left.artifactID.localeCompare(right.artifactID)),
  })
}

async function readFigureArtifactMetadata(input: {
  directory: string
  artifactID: string
}): Promise<z.infer<typeof figureReadResponseSchema>> {
  const manifest = await readArtifactManifest({
    directory: input.directory,
    kind: ARTIFACT_KINDS.figure,
    artifactID: input.artifactID,
    schema: FigureArtifactManifestSchema,
  })
  return figureReadResponseSchema.parse({
    artifactID: manifest.artifactID,
    kind: manifest.kind,
    title: manifest.title,
    ...(manifest.description ? { description: manifest.description } : {}),
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    sourceHash: manifest.sourceHash,
    summary: manifest.summary,
    rawUrl: `/api/artifacts/${manifest.kind}/${manifest.artifactID}/raw?directory=${encodeURIComponent(input.directory)}`,
  })
}

async function readFreeformFigureArtifactMetadata(input: {
  directory: string
  artifactID: string
}): Promise<z.infer<typeof freeformFigureReadResponseSchema>> {
  const manifest = await readArtifactManifest({
    directory: input.directory,
    kind: ARTIFACT_KINDS.freeformFigure,
    artifactID: input.artifactID,
    schema: FreeformFigureArtifactManifestSchema,
  })
  return freeformFigureReadResponseSchema.parse({
    artifactID: manifest.artifactID,
    kind: manifest.kind,
    title: manifest.title,
    ...(manifest.description ? { description: manifest.description } : {}),
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    sourceHash: manifest.sourceHash,
    summary: manifest.summary,
    rawUrl: `/api/artifacts/${manifest.kind}/${manifest.artifactID}/raw?directory=${encodeURIComponent(input.directory)}`,
  })
}

export {
  artifactIndexResponseSchema,
  figureReadResponseSchema,
  freeformFigureReadResponseSchema,
  listArtifactIndex,
  readFreeformFigureArtifactMetadata,
  readFigureArtifactMetadata,
}

export type { ArtifactIndexItem }
