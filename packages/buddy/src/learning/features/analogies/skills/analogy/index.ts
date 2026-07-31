import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const analogySkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Analogies",
    shortDescription: "Build clear analogies that connect new ideas to familiar ones",
    icon: "buddy-skill-analogy.webp",
  },
})
