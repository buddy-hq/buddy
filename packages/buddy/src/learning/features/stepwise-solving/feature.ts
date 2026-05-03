import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { stepwiseSolveTool, dynamicStepwiseSolveTool } from "./tools/stepwise-solve"

export const stepwiseSolvingFeature = defineBuddyFeature({
  id: "stepwise-solving",
  tools: [stepwiseSolveTool, dynamicStepwiseSolveTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
