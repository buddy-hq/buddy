import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const resolveConfusionSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Resolve Misconceptions",
    shortDescription: "Replace faulty mental models and verify understanding",
  },
})
