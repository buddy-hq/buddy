import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import BENCH_FEATURE_PROMPT from "./bench-feature.p.md"
import { benchPresentTool, benchReadContextTool } from "./tools/tools"

export const benchFeature = defineBuddyFeature({
  id: "bench",
  prompt: {
    instructions: BENCH_FEATURE_PROMPT,
  },
  tools: [benchReadContextTool, benchPresentTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
