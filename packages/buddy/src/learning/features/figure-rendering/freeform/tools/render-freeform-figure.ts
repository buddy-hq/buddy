import RENDER_FREEFORM_FIGURE_DESCRIPTION from "./render-freeform-figure.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import { buildPresentedMediaOutputForPath } from "../../../media-presentations/service/file-media"
import { FreeformFigurePath } from "../path"
import { renderFreeformFigure } from "../service/render"

const nonEmptyString = z.string().trim().min(1)

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
      patterns: [FreeformFigurePath.glob(ctx.directory)],
      always: ["*"],
      metadata: {
        kind: "svg.v1",
      },
    })

    const result = await renderFreeformFigure(ctx.directory, params)
    const presentedMedia = await buildPresentedMediaOutputForPath({
      directory: ctx.directory,
      path: result.relativePath,
    })

    return {
      title: "Rendered freeform figure",
      output: JSON.stringify(result, null, 2),
      metadata: {
        artifact: "PresentedMediaOutput",
        value: presentedMedia,
        producerArtifact: {
          artifact: "RenderFreeformFigureOutput",
          value: result,
        },
      },
    }
  },
})

export { renderFreeformFigureTool, RenderFreeformFigureInputSchema }
export type { RenderFreeformFigureInput }
