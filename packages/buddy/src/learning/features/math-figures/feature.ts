import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { renderFigureTool } from "./geometry/tools/render-figure"
import { renderFreeformFigureTool } from "./freeform/tools/render-freeform-figure"

export const mathFiguresFeature = defineBuddyFeature({
  id: "math-figures",
  tools: [renderFigureTool, renderFreeformFigureTool],
  skills: [],
  subagents: [],
  surfaces: ["figure"],
})
