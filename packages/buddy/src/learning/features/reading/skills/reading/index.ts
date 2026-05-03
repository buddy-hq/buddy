import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const readingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
