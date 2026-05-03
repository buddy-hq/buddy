import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const practiceSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
