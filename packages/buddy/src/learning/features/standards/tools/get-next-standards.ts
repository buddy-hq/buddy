import GET_NEXT_STANDARDS_DESCRIPTION from "./get-next-standards.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { progressionParameters } from "./parameters"

export const getNextStandardsTool = createBuddyTool({
  id: "get_next_standards",
  description: GET_NEXT_STANDARDS_DESCRIPTION,
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
  constraints: { runtime: "standards" as const },
})
