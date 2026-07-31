import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const teachChemistrySkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Teach Chemistry",
    shortDescription: "Teach chemistry with inline structure and reaction diagrams",
    icon: "buddy-skill-teach-chemistry.webp",
  },
})
