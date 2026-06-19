import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectValidationError,
  BuddyObjectViewResponseSchema,
  FigureObjectSummarySchema,
  readObjectManifest,
  readObjectTextFile,
  registerBuddyObjectKind,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import {
  buildFigureObjectRawUrl,
  FIGURE_RENDERED_VIEW_ID,
  figureRevisionSvgPath,
} from "./render-figure"

async function readGeometryFigureObject(input: {
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
    summary: FigureObjectSummarySchema,
  }).parse(await readObjectManifest({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.figure,
    objectID: input.objectID,
  }))
  const revisionID = input.revisionID ?? manifest.currentRevisionID
  if (!revisionID) {
    throw new Error(`Figure object '${input.objectID}' has no current revision.`)
  }
  return {
    objectID: input.objectID,
    revisionID,
    title: manifest.title,
    caption: manifest.summary.caption,
    svg: await readObjectTextFile({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.figure,
      objectID: input.objectID,
      relativePath: figureRevisionSvgPath(revisionID),
    }),
    rawUrl: buildFigureObjectRawUrl({
      directory: input.directory,
      objectID: input.objectID,
      revisionID,
    }),
  }
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.figure,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: FigureObjectSummarySchema,
  }),
  async readManifest(input) {
    return BuddyObjectManifestSchema.safeExtend({
      summary: FigureObjectSummarySchema,
    }).parse(await readObjectManifest({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.figure,
      objectID: input.ref.objectID,
    }))
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== FIGURE_RENDERED_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported figure view: ${input.viewID}`)
    }
    const figure = await readGeometryFigureObject({
      directory: input.directory,
      objectID: input.ref.objectID,
      revisionID: input.ref.revisionID,
    })
    return BuddyObjectViewResponseSchema.parse({
      ref: {
        kind: BUDDY_OBJECT_KINDS.figure,
        objectID: figure.objectID,
        revisionID: figure.revisionID,
        itemID: null,
      },
      viewID: FIGURE_RENDERED_VIEW_ID,
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
    if (input.viewID !== FIGURE_RENDERED_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_figure_view",
        message: `Unsupported figure Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: FIGURE_RENDERED_VIEW_ID,
      },
    }
  },
})

export { readGeometryFigureObject }
