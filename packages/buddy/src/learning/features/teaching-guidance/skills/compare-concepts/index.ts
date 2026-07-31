import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const compareConceptsSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Compare Concepts",
    shortDescription: "Contrast related concepts and clarify their boundaries",
    icon: "buddy-skill-compare-concepts.webp",
  },
})
