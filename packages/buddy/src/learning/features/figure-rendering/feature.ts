import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import "./geometry/read-figure"
import { renderFigureTool } from "./geometry/tools/render-figure"
import { renderFreeformFigureTool } from "./freeform/tools/render-freeform-figure"

export const figureRenderingFeature = defineBuddyFeature({
  id: "figure-rendering",
  tools: [renderFigureTool, renderFreeformFigureTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
