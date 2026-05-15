import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { teachMathematicsSkill } from "./skills/teach-mathematics"

export const mathFeature = defineBuddyFeature({
  id: "math",
  tools: [],
  skills: [teachMathematicsSkill],
  subagents: [],
  surfaces: [],
})
