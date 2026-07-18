import GET_STANDARD_DESCRIPTION from "./get-standard.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { resolveStandardParameters } from "./parameters"

export const getStandardTool = createBuddyTool({
  id: "get_standard",
  description: GET_STANDARD_DESCRIPTION,
  parameters: resolveStandardParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading standard" },
      running: { action: "Reading standard" },
      completed: { action: "Read standard" },
      error: { action: "Failed to read standard" },
    },
    summary: {
      category: "read-standards",
      pending: "Reading standards",
      running: "Reading standards",
      completed: "Read standards",
      error: "Failed to read standards",
    },
  },
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "get_standard",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        code: params.code,
        jurisdiction: params.jurisdiction,
      },
    })

    const result = getKnowledgeGraphService().getStandard(params)
    return {
      title: "knowledge_graph_standard",
      output: JSON.stringify(result, null, 2),
      metadata: {
        value: result,
      },
    }
  },
  constraints: { runtime: "standards" as const },
})
