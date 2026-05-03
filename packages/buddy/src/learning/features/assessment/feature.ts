import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { ASSESSMENT_AGENT } from "./subagents/assessment"

export const assessmentFeature = defineBuddyFeature({
  id: "assessment",
  tools: [],
  skills: [],
  subagents: [ASSESSMENT_AGENT],
  surfaces: [],
})
