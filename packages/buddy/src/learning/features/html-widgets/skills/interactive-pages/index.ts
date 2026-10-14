import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const interactivePagesSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Interactive Pages",
    shortDescription: "Build hands-on pages the learner explores and tests",
  },
})
