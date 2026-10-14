import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const readingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Reading",
    shortDescription: "Read and study books, articles, documents, and web pages",
    icon: "buddy-skill-reading.webp",
  },
})
