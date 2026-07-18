import z from "zod"
import RENDER_FIGURE_DESCRIPTION from "./render-figure.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../../objects"
import { GeometryFigureSpecSchema } from "../types"
import {
  FIGURE_RENDERED_VIEW_ID,
  renderGeometryFigure,
  type RenderGeometryFigureObjectOutput,
} from "../render-figure"

const RenderFigureInputSchema = z.object({
  caption: nonEmptyString.optional(),
  spec: GeometryFigureSpecSchema,
})

type RenderFigureInput = z.infer<typeof RenderFigureInputSchema>

function buildRenderFigureObjectResult(input: {
  figure: RenderGeometryFigureObjectOutput
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.figure,
    objectID: input.figure.objectID,
    revisionID: input.figure.revisionID,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: "Rendered figure object.",
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.figure,
        objectID: input.figure.objectID,
        title: input.figure.alt,
        status: "ready",
        lifecycle: "revisioned",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: FIGURE_RENDERED_VIEW_ID,
        surface: "inline",
        data: {
          renderer: "figure",
          svgUrl: input.figure.rawUrl,
          source: null,
          alt: input.figure.alt,
          caption: input.figure.caption,
          renderStatus: "ready",
        },
        autoOpen: null,
      },
    ],
  })
}

const renderFigureTool = createBuddyTool({
  id: "render_figure",
  produces: {
    buddyObjectResult: true,
  },
  description: RENDER_FIGURE_DESCRIPTION,
  parameters: RenderFigureInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "image",
    renderer: "figure",
    layoutRole: "media-output",
    collection: "figure-gallery",
    phases: {
      pending: { action: "Rendering figure" },
      running: { action: "Rendering figure" },
      completed: { action: "Rendered figure" },
      error: { action: "Failed to render figure" },
    },
  },
  async execute(params: RenderFigureInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_figure",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: BUDDY_OBJECT_KINDS.figure,
      },
    })

    const figure = await renderGeometryFigure(ctx.directory, params)
    const buddyObjectResult = buildRenderFigureObjectResult({ figure })

    return {
      title: "Rendered figure",
      output: [
        buddyObjectResult.message,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `revision_id=${figure.revisionID}`,
      ].join("\n"),
      metadata: {
        buddyObjectResult,
      },
    }
  },
})

export { renderFigureTool, RenderFigureInputSchema }
export type { RenderFigureInput }
