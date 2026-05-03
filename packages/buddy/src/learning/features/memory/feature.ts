import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT } from "./subagents/memory-consolidator"
import { learnerMemorySearchTool } from "./tools/search-memory"
import { learnerMemoryUpdateTool } from "./tools/update-memory"

export const memoryFeature = defineBuddyFeature({
  id: "memory",
  tools: [learnerMemorySearchTool, learnerMemoryUpdateTool],
  skills: [],
  subagents: [LEARNER_MEMORY_CONSOLIDATOR_AGENT],
  surfaces: [],
})
