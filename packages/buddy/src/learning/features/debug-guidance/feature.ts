import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { debugAttemptTool, dynamicDebugAttemptTool } from "./tools/debug-attempt"

export const debugGuidanceFeature = defineBuddyFeature({
  id: "debug-guidance",
  tools: [debugAttemptTool, dynamicDebugAttemptTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
