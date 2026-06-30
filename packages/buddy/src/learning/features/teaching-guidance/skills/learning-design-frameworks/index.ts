import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const learningDesignFrameworksSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Learning Design Frameworks",
    shortDescription: "Design learning with established teaching frameworks",
  },
})
