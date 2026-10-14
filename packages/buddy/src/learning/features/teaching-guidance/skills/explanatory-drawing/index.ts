import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const explanatoryDrawingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Explanatory Drawing",
    shortDescription: "Compose clear pictures that explain one idea at a time",
  },
})
