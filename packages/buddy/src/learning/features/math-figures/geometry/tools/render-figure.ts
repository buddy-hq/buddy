import z from "zod"
import RENDER_FIGURE_DESCRIPTION from "./render-figure.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import { FigurePath } from "../path"
import { GeometryFigureSpecSchema } from "../types"
import { renderGeometryFigure } from "../render-figure"

const nonEmptyString = z.string().trim().min(1)

const RenderFigureInputSchema = z.object({
  kind: z.literal("geometry.v1"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  spec: GeometryFigureSpecSchema,
})

type RenderFigureInput = z.infer<typeof RenderFigureInputSchema>

const renderFigureTool = createBuddyTool({
  id: "render_figure",
  description: RENDER_FIGURE_DESCRIPTION,
  parameters: RenderFigureInputSchema,
  async execute(params: RenderFigureInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_figure",
      patterns: [FigurePath.glob(ctx.directory)],
      always: ["*"],
      metadata: {
        kind: params.kind,
      },
    })

    const result = await renderGeometryFigure(ctx.directory, params)
    return {
      title: "Rendered figure",
      output: JSON.stringify(result, null, 2),
      metadata: {
        artifact: "RenderFigureOutput",
        value: result,
      },
    }
  },
})

export { renderFigureTool, RenderFigureInputSchema }
export type { RenderFigureInput }
