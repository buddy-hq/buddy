import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const findAndShowResourcesSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Real Resources",
    shortDescription: "Find and show real sources, simulations, and videos",
  },
})
