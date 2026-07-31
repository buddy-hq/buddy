import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const buddyHelpSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Buddy Help",
    shortDescription: "How Buddy works: setup, workspace, skills, MCP",
    icon: "buddy-skill-buddy-help.webp",
  },
})
