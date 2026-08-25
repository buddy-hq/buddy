import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { inAppBrowserOpenTool } from "./tools/open"

export const browserFeature = defineBuddyFeature({
  id: "browser",
  tools: [inAppBrowserOpenTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
