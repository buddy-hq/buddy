import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { analogySkill } from "./skills/analogy"

export const analogiesFeature = defineBuddyFeature({
  id: "analogies",
  tools: [],
  skills: [analogySkill],
  subagents: [],
  surfaces: [],
})
