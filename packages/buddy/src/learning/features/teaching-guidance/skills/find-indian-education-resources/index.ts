import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const findIndianEducationResourcesSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Indian Education Resources",
    shortDescription: "Find current official Indian education resources",
    icon: "buddy-skill-find-indian-education-resources.webp",
  },
})
