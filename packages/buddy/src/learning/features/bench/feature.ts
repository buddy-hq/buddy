import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { benchPresentTool, benchReadContextTool } from "./tools/tools"

export const benchFeature = defineBuddyFeature({
  id: "bench",
  tools: [benchReadContextTool, benchPresentTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
