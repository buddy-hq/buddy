import GET_NEXT_STANDARDS_DESCRIPTION from "./get-next-standards.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { progressionParameters } from "./parameters"

export const getNextStandardsTool = createBuddyTool({
  id: "get_next_standards",
  description: GET_NEXT_STANDARDS_DESCRIPTION,
  parameters: progressionParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading next standards" },
      running: { action: "Reading next standards" },
      completed: { action: "Read next standards" },
      error: { action: "Failed to read next standards" },
    },
    summary: {
      category: "read-next-standards",
      pending: "Reading next standards",
      running: "Reading next standards",
      completed: "Read next standards",
      error: "Failed to read next standards",
    },
  },
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
