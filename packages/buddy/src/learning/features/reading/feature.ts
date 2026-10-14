import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { prepareResourceTool } from "./tools/prepare-resource"
import { ingestFullTextTool } from "./tools/ingest-full-text"
import { readingSkill } from "./skills/reading"
import { summariseSkill } from "./skills/summarise"

export const readingFeature = defineBuddyFeature({
  id: "reading",
  tools: [prepareResourceTool, ingestFullTextTool],
  skills: [readingSkill, summariseSkill],
  subagents: [],
  surfaces: [],
})
