import skillDocument from "./SKILL.md"
import { defineBuddySkill } from "../../../../runtime/define-buddy-skill"

export const whiteboardAuthoringSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: skillDocument,
  presentation: {
    displayName: "Whiteboard Authoring",
    shortDescription: "Create clear editable whiteboards for visual teaching",
    icon: "buddy-skill-whiteboard-authoring.webp",
  },
})
