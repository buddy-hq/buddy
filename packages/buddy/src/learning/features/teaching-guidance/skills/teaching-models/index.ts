import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const teachingModelsSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Teaching Models",
    shortDescription: "Choose the right teaching approach for the learner",
    icon: "buddy-skill-teaching-models.webp",
  },
})
