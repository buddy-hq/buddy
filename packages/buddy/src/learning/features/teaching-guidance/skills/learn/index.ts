import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const learnSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Conceptual Learning",
    shortDescription: "Build conceptual understanding before meaningful practice",
    icon: "buddy-skill-learn.webp",
  },
})
