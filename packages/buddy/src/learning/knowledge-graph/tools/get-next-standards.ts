import {
  createBuddyTool,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolContext,
} from "../../tools/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { progressionParameters } from "./parameters"

export const getNextStandardsTool = createBuddyTool(
  "get_next_standards",
  {
    description: `- Find standards that naturally follow from a target standard
- Returns next topics in the learning progression
- Use when the learner has mastered a topic and wants to know what comes next
- Use to plan curriculum sequences beyond the current goal
- Set depth=2 or 3 to see further ahead in the progression
- Requires a standard code - get one from search_standards or the learner first`,
    parameters: progressionParameters,
    async execute(params, ctx: BuddyToolContext) {
      await ctx.ask({
        permission: "get_next_standards",
        patterns: ["*"],
        always: ["*"],
        metadata: {
          code: params.code,
          jurisdiction: params.jurisdiction,
          depth: params.depth,
          limit: params.limit,
        },
      })

      const standard = getKnowledgeGraphService().getStandard(params)
      const nextStandards = getKnowledgeGraphService().getNextStandards(params)
      const result = {
        standard,
        nextStandardCount: nextStandards.length,
        nextStandards,
      }

      return {
        title: "knowledge_graph_next_standards",
        output: JSON.stringify(result, null, 2),
        metadata: {
          value: result,
        },
      }
    },
  },
  {
    runtimeDependency: STANDARDS_RUNTIME_DEPENDENCY,
  },
)
