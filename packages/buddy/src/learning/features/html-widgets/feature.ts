import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { interactivePagesSkill } from "./skills/interactive-pages"
import { presentHtmlWidgetTool } from "./tools/present-html-widget"

export const htmlWidgetsFeature = defineBuddyFeature({
  id: "html-widgets",
  tools: [presentHtmlWidgetTool],
  skills: [interactivePagesSkill],
  subagents: [],
  surfaces: [],
})
