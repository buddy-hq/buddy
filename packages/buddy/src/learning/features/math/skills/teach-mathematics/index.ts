import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const teachMathematicsSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Teach Mathematics",
    shortDescription: "Teach mathematics with figures, computation, and proof",
  },
})
