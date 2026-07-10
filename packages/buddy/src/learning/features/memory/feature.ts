import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { EXPERIMENTAL_FEATURE_ID } from "../../../experimental-features/catalog"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT } from "./subagents/memory-consolidator"
import { learnerMemorySearchTool } from "./tools/search-memory"
import { learnerMemoryUpdateTool } from "./tools/update-memory"
import LEARNER_MEMORY_FEATURE_PROMPT from "./memory-feature.p.md"

export const memoryFeature = defineBuddyFeature({
  id: "memory",
  release: {
    channel: "experimental",
    experimentalFeatureID: EXPERIMENTAL_FEATURE_ID.learnerMemory,
  },
  enabledWhen: (config) => config.learner_memory?.enabled === true,
  prompt: {
    instructions: LEARNER_MEMORY_FEATURE_PROMPT,
  },
  tools: [learnerMemorySearchTool, learnerMemoryUpdateTool],
  skills: [],
  subagents: [LEARNER_MEMORY_CONSOLIDATOR_AGENT],
  surfaces: [],
})
