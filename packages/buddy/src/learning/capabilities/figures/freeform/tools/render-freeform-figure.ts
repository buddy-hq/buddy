import RENDER_FREEFORM_FIGURE_DESCRIPTION from "./render-freeform-figure.md"
import {
  createBuddyTool,
  FIGURE_PERSONA_SURFACE,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import z from "zod"
import { FreeformFigurePath } from "../path"
import { renderFreeformFigure } from "../service/render"

const nonEmptyString = z.string().trim().min(1)

const RenderFreeformFigureInputSchema = z.object({
  kind: z.literal("svg.v1"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
})

type RenderFreeformFigureInput = z.infer<typeof RenderFreeformFigureInputSchema>

const renderFreeformFigureTool = createBuddyTool({
  id: "render_freeform_figure",
  description: RENDER_FREEFORM_FIGURE_DESCRIPTION,
  parameters: RenderFreeformFigureInputSchema,
  async execute(params: RenderFreeformFigureInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_freeform_figure",
      patterns: [FreeformFigurePath.glob(ctx.directory)],
      always: ["*"],
      metadata: {
        kind: params.kind,
      },
    })

    const result = await renderFreeformFigure(ctx.directory, params)
    return {
      title: "Rendered freeform figure",
      output: JSON.stringify(result, null, 2),
      metadata: {
        artifact: "RenderFreeformFigureOutput",
        value: result,
      },
    }
  },
  capability: {
    surfaces: [FIGURE_PERSONA_SURFACE],
  },
})

export { renderFreeformFigureTool, RenderFreeformFigureInputSchema }
export type { RenderFreeformFigureInput }
