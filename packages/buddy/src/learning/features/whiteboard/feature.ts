import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { whiteboardAuthoringSkill } from "./skills/whiteboard-authoring"
import { createWhiteboardViewTool, readWhiteboardContextTool } from "./tools/tools"

export const whiteboardFeature = defineBuddyFeature({
  id: "whiteboard",
  tools: [createWhiteboardViewTool, readWhiteboardContextTool],
  skills: [whiteboardAuthoringSkill],
  subagents: [],
  surfaces: [],
})
