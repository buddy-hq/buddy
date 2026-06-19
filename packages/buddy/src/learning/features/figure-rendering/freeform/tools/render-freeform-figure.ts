import RENDER_FREEFORM_FIGURE_DESCRIPTION from "./render-freeform-figure.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../../objects"
import { renderFreeformFigure, type RenderFreeformFigureOutput } from "../service/render"
import { FREEFORM_FIGURE_RENDERED_VIEW_ID } from "../service/io"

const RenderFreeformFigureInputSchema = z.object({
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
})

type RenderFreeformFigureInput = z.infer<typeof RenderFreeformFigureInputSchema>

function buildRenderFreeformFigureObjectResult(input: {
  figure: RenderFreeformFigureOutput
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.freeformFigure,
    objectID: input.figure.objectID,
    revisionID: input.figure.revisionID,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: "Rendered freeform figure object.",
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.freeformFigure,
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
        viewID: FREEFORM_FIGURE_RENDERED_VIEW_ID,
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

const renderFreeformFigureTool = createBuddyTool({
  id: "render_freeform_figure",
  produces: {
    buddyObjectResult: true,
  },
  description: RENDER_FREEFORM_FIGURE_DESCRIPTION,
  parameters: RenderFreeformFigureInputSchema,
  async execute(params: RenderFreeformFigureInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_freeform_figure",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: BUDDY_OBJECT_KINDS.freeformFigure,
      },
    })

    const figure = await renderFreeformFigure(ctx.directory, params)
    const buddyObjectResult = buildRenderFreeformFigureObjectResult({ figure })

    return {
      title: "Rendered freeform figure",
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

export { renderFreeformFigureTool, RenderFreeformFigureInputSchema }
export type { RenderFreeformFigureInput }
