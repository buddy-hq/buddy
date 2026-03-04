import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { FigurePath } from "../path.js"
import { FigureService } from "../service.js"
import { RenderFigureInputSchema, type RenderFigureInput } from "../types.js"

const renderFigureTool = createBuddyTool("render_figure", {
  description:
    "Render a validated constrained geometry figure spec into a deterministic SVG for inline chat display. Use this when a math explanation depends on exact geometry, layout, intersections, perpendiculars, area decomposition, or named spatial relationships that fit the `geometry.v1` schema. Prefer exact `constraints` for derived geometry such as points on segments, perpendicular feet, or line intersections instead of hand-placing every dependent point. Use `render_freeform_figure` instead when the drawing needs arbitrary SVG beyond the constrained geometry schema. The chat UI renders the returned figure automatically after the tool call; continue the explanation in normal text and do not rewrite the returned image URL or markdown. It can repair minor spec issues when possible.",
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

    const result = await FigureService.render(ctx.directory, params)
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

export { renderFigureTool }
