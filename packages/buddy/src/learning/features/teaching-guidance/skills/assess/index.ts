import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const assessSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
