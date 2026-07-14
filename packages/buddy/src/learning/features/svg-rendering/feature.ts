import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { renderSvgTool } from "./tools/render-svg"

export const svgRenderingFeature = defineBuddyFeature({
  id: "svg-rendering",
  tools: [renderSvgTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
