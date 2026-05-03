import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const learnSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
