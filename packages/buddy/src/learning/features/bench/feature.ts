import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { benchPresentTool, benchReadChatTool, benchReadContextTool } from "./tools/tools"

export const benchFeature = defineBuddyFeature({
  id: "bench",
  tools: [benchReadContextTool, benchReadChatTool, benchPresentTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
