import z from "zod"
import path from "node:path"
import RENDER_FIGURE_DESCRIPTION from "./render-figure.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
  nonEmptyString,
} from "../../../../../artifacts"
import { GeometryFigureSpecSchema } from "../types"
import { renderGeometryFigure } from "../render-figure"

const RenderFigureInputSchema = z.object({
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
      patterns: [
        path.join(
          ArtifactPath.kindRoot(ctx.directory, ARTIFACT_KINDS.figure),
          "*",
          ARTIFACT_CONTENT_FILES.figureSvg,
        ),
      ],
      always: ["*"],
      metadata: {
        kind: "geometry.v1",
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
