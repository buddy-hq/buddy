import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { presentHtmlWidgetTool } from "./tools/present-html-widget"

export const htmlWidgetsFeature = defineBuddyFeature({
  id: "html-widgets",
  tools: [presentHtmlWidgetTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
