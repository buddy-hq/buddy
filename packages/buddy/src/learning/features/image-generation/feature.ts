import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { imagegenTool } from "./tools/imagegen"

export const imageGenerationFeature = defineBuddyFeature({
  id: "image-generation",
  tools: [imagegenTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
