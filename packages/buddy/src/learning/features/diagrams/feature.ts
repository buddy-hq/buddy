import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { renderMermaidTool } from "./tools/render-mermaid"

export const diagramsFeature = defineBuddyFeature({
  id: "diagrams",
  tools: [renderMermaidTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
