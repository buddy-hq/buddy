import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const alignTeachingTopicsToGradeLevelAndAgeSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Grade & Age Alignment",
    shortDescription: "Match teaching depth and material to learner readiness",
  },
})
