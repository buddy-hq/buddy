import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  FreeformFigureObjectSummarySchema,
  readObjectManifest,
  readObjectTextFile,
  registerBuddyObjectKind,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectViewResponse,
} from "../../../../../objects"

const FREEFORM_FIGURE_SVG_FILE_NAME = "figure.svg"
const FREEFORM_FIGURE_SOURCE_FILE_NAME = "figure-source.json"
const FREEFORM_FIGURE_RENDERED_VIEW_ID = "rendered"

type FreeformFigureObjectManifest = BuddyObjectManifest & {
  summary: ReturnType<typeof FreeformFigureObjectSummarySchema.parse>
}

function freeformFigureRevisionSvgPath(revisionID: string): string {
  return `revisions/${revisionID}/${FREEFORM_FIGURE_SVG_FILE_NAME}`
}

function freeformFigureRevisionSourcePath(revisionID: string): string {
  return `revisions/${revisionID}/${FREEFORM_FIGURE_SOURCE_FILE_NAME}`
}

function buildFreeformFigureObjectRawUrl(input: {
  directory: string
  objectID: string
  revisionID: string
}): string {
  return `/api/objects/freeform-figure/${input.objectID}/raw?directory=${encodeURIComponent(input.directory)}&revisionID=${encodeURIComponent(input.revisionID)}`
}

async function readFreeformFigureObject(input: {
  directory: string
  objectID: string
  revisionID?: string | null
}): Promise<{
  objectID: string
  revisionID: string
  title: string
  caption: string | null
  svg: string
  rawUrl: string
}> {
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: FreeformFigureObjectSummarySchema,
  }).parse(await readObjectManifest({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.freeformFigure,
    objectID: input.objectID,
  }))
  const revisionID = input.revisionID ?? manifest.currentRevisionID
  if (!revisionID) {
    throw new Error(`Freeform figure object '${input.objectID}' has no current revision.`)
  }
  return {
    objectID: input.objectID,
    revisionID,
    title: manifest.title,
    caption: manifest.summary.caption,
    svg: await readObjectTextFile({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.freeformFigure,
      objectID: input.objectID,
      relativePath: freeformFigureRevisionSvgPath(revisionID),
    }),
    rawUrl: buildFreeformFigureObjectRawUrl({
      directory: input.directory,
      objectID: input.objectID,
      revisionID,
    }),
  }
}

async function writeFreeformFigureObject(input: {
  directory: string
  objectID: string
  revisionID: string
  svg: string
  sourceHash: string
  alt: string
  caption?: string
  createdAt: string
}): Promise<FreeformFigureObjectManifest> {
  const objectRoot = BuddyObjectPath.relativeObjectDirectory(
    BUDDY_OBJECT_KINDS.freeformFigure,
    input.objectID,
  )
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: FreeformFigureObjectSummarySchema,
  }).parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.freeformFigure,
    objectID: input.objectID,
    title: input.alt,
    ...(input.caption ? { description: input.caption } : {}),
    status: "ready",
    lifecycle: "revisioned",
    currentRevisionID: input.revisionID,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    sourceRefs: [
      {
        role: "payload",
        path: `${objectRoot}/${freeformFigureRevisionSvgPath(input.revisionID)}`,
        displayPath: `${objectRoot}/${freeformFigureRevisionSvgPath(input.revisionID)}`,
        workspacePath: null,
        mutable: false,
        copied: false,
        availability: "available",
        exists: true,
        contentHash: input.sourceHash,
      },
    ],
    views: [
      {
        viewID: FREEFORM_FIGURE_RENDERED_VIEW_ID,
        label: "Rendered",
        surfaces: ["inline", "bench", "library"],
        availability: { status: "available" },
        inline: {
          renderer: "figure",
          params: {
            renderer: "figure",
            figureKind: "freeform",
          },
        },
        bench: { resolver: "object-view" },
        library: { section: "diagrams" },
      },
    ],
    summary: {
      kind: BUDDY_OBJECT_KINDS.freeformFigure,
      caption: input.caption ?? null,
      renderStatus: "ready",
    },
  })

  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.freeformFigure,
    objectID: input.objectID,
    manifest,
    files: [
      {
        relativePath: freeformFigureRevisionSvgPath(input.revisionID),
        format: "text",
        content: input.svg,
      },
      {
        relativePath: freeformFigureRevisionSourcePath(input.revisionID),
        format: "json",
        content: {
          sourceHash: input.sourceHash,
          repairAttempts: 0,
        },
      },
    ],
  })
  return manifest
}

const freeformFigureManifestSchema = BuddyObjectManifestSchema.safeExtend({
  summary: FreeformFigureObjectSummarySchema,
})

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.freeformFigure,
  manifestSchema: freeformFigureManifestSchema,
  async readManifest(input): Promise<FreeformFigureObjectManifest> {
    return freeformFigureManifestSchema.parse(await readObjectManifest({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.freeformFigure,
      objectID: input.ref.objectID,
    }))
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== FREEFORM_FIGURE_RENDERED_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported freeform figure view: ${input.viewID}`)
    }
    const figure = await readFreeformFigureObject({
      directory: input.directory,
      objectID: input.ref.objectID,
      revisionID: input.ref.revisionID,
    })
    return BuddyObjectViewResponseSchema.parse({
      ref: {
        kind: BUDDY_OBJECT_KINDS.freeformFigure,
        objectID: figure.objectID,
        revisionID: figure.revisionID,
        itemID: null,
      },
      viewID: FREEFORM_FIGURE_RENDERED_VIEW_ID,
      title: figure.title,
      data: {
        renderer: "figure",
        svgUrl: figure.rawUrl,
        source: null,
        alt: figure.title,
        caption: figure.caption,
        renderStatus: "ready",
      },
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== FREEFORM_FIGURE_RENDERED_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_freeform_figure_view",
        message: `Unsupported freeform figure Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: FREEFORM_FIGURE_RENDERED_VIEW_ID,
      },
    }
  },
})

export {
  buildFreeformFigureObjectRawUrl,
  FREEFORM_FIGURE_RENDERED_VIEW_ID,
  freeformFigureRevisionSvgPath,
  readFreeformFigureObject,
  writeFreeformFigureObject,
}
