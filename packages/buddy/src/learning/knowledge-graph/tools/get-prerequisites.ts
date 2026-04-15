import {
  createBuddyTool,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolContext,
} from "../../tools/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { progressionParameters } from "./parameters"

export const getPrerequisitesTool = createBuddyTool(
  "get_prerequisites",
  {
    description: `- Find prerequisite standards that lead up to a target standard
- Returns standards the learner should know before tackling the target
- Use when the learner is stuck on a topic to identify gaps in prior knowledge
- Use to create remediation sequences starting from missing foundations
- Set depth=2 or 3 to see deeper prerequisite chains
- Requires a standard code - get one from search_standards or the learner first`,
    parameters: progressionParameters,
    async execute(params, ctx: BuddyToolContext) {
      await ctx.ask({
        permission: "get_prerequisites",
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
      const prerequisites = getKnowledgeGraphService().getPrerequisites(params)
      const result = {
        standard,
        prerequisiteCount: prerequisites.length,
        prerequisites,
      }

      return {
        title: "knowledge_graph_prerequisites",
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
