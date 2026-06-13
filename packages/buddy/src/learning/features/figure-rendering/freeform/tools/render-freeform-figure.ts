import RENDER_FREEFORM_FIGURE_DESCRIPTION from "./render-freeform-figure.md"
import path from "node:path"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
  nonEmptyString,
} from "../../../../../artifacts"
import { renderFreeformFigure } from "../service/render"

const RenderFreeformFigureInputSchema = z.object({
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
      patterns: [
        path.join(
          ArtifactPath.kindRoot(ctx.directory, ARTIFACT_KINDS.freeformFigure),
          "*",
          ARTIFACT_CONTENT_FILES.figureSvg,
        ),
      ],
      always: ["*"],
      metadata: {
        kind: "svg.v1",
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
})

export { renderFreeformFigureTool, RenderFreeformFigureInputSchema }
export type { RenderFreeformFigureInput }
