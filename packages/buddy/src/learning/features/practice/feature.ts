import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { PRACTICE_AGENT } from "./subagents/practice"

export const practiceFeature = defineBuddyFeature({
  id: "practice",
  tools: [],
  skills: [],
  subagents: [PRACTICE_AGENT],
  surfaces: [],
})
