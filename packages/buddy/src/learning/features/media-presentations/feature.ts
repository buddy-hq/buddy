import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { presentMediaTool } from "./tools/present-media"

export const mediaPresentationsFeature = defineBuddyFeature({
  id: "media-presentations",
  tools: [presentMediaTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
