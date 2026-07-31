import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const readingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Reading",
    shortDescription: "Read and analyze books, papers, articles, and resources",
    icon: "buddy-skill-reading.webp",
  },
})
