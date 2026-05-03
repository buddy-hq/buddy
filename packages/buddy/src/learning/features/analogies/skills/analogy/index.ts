import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const analogySkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
