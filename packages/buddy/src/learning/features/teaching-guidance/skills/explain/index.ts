import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const explainSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
