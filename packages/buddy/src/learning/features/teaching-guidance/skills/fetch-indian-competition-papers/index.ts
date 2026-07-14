import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const fetchIndianCompetitionPapersSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Indian Competition Papers",
    shortDescription: "Fetch official Indian competitive exam papers and answer keys",
  },
})
