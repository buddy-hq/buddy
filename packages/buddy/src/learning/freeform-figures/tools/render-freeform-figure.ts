import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { FreeformFigurePath } from "../path.js"
import { FreeformFigureService } from "../service.js"
import { RenderFreeformFigureInputSchema, type RenderFreeformFigureInput } from "../types.js"

const renderFreeformFigureTool = createBuddyTool("render_freeform_figure", {
  description:
    "Render any valid SVG figure for inline chat display. Use this when the diagram needs arbitrary shapes, curves, custom layouts, or any figure that does not fit the constrained geometry tool. This tool only lints for SVG compilation/parse errors and does not constrain the drawing to a fixed schema beyond requiring valid SVG markup. The chat UI renders the returned figure automatically after the tool call.",
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

    const result = await FreeformFigureService.render(ctx.directory, params)
    return {
      title: "Rendered freeform figure",
      output: JSON.stringify(result, null, 2),
      metadata: {
        artifact: "RenderFreeformFigureOutput",
        value: result,
      },
    }
  },
})

export { renderFreeformFigureTool }
