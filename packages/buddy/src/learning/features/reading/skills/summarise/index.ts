import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const summariseSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Summarise",
    shortDescription: "Summaries that lead with the main point",
  },
})
