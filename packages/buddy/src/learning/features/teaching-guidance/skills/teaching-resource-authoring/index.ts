import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const teachingResourceAuthoringSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Teaching Resources",
    shortDescription: "Create and revise assessments, worksheets, and rubrics",
  },
})
