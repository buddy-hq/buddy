import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const workedExampleSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
