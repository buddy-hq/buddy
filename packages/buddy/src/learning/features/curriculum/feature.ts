import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { CURRICULUM_ORCHESTRATOR } from "./subagents/orchestrator"

export const curriculumFeature = defineBuddyFeature({
  id: "curriculum",
  tools: [],
  skills: [],
  subagents: [CURRICULUM_ORCHESTRATOR],
  surfaces: ["curriculum"],
})
