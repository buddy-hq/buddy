import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { renderFigureTool } from "./geometry/tools/render-figure"
import { renderFreeformFigureTool } from "./freeform/tools/render-freeform-figure"

export const figureRenderingFeature = defineBuddyFeature({
  id: "figure-rendering",
  tools: [renderFigureTool, renderFreeformFigureTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
