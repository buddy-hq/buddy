import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { buddyHelpSkill } from "./skills/buddy-help"

export const platformFeature = defineBuddyFeature({
  id: "platform",
  tools: [],
  skills: [buddyHelpSkill],
  subagents: [],
  surfaces: [],
})
