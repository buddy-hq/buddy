import GET_PREREQUISITES_DESCRIPTION from "./get-prerequisites.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { progressionParameters } from "./parameters"

export const getPrerequisitesTool = createBuddyTool({
  id: "get_prerequisites",
  description: GET_PREREQUISITES_DESCRIPTION,
  parameters: progressionParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading prerequisites" },
      running: { action: "Reading prerequisites" },
      completed: { action: "Read prerequisites" },
      error: { action: "Failed to read prerequisites" },
    },
    summary: {
      category: "read-prerequisites",
      pending: "Reading prerequisites",
      running: "Reading prerequisites",
      completed: "Read prerequisites",
      error: "Failed to read prerequisites",
    },
  },
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
  constraints: { runtime: "standards" as const },
})
