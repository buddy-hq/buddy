import GET_CROSSWALK_DESCRIPTION from "./get-crosswalk.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { crosswalkParameters } from "./parameters"

export const getCrosswalkTool = createBuddyTool({
  id: "get_crosswalk",
  description: GET_CROSSWALK_DESCRIPTION,
  parameters: crosswalkParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading standards crosswalk" },
      running: { action: "Reading standards crosswalk" },
      completed: { action: "Read standards crosswalk" },
      error: { action: "Failed to read standards crosswalk" },
    },
    summary: {
      category: "read-standards-crosswalk",
      pending: "Reading standards crosswalks",
      running: "Reading standards crosswalks",
      completed: "Read standards crosswalks",
      error: "Failed to read standards crosswalks",
    },
  },
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "get_crosswalk",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        code: params.code,
        jurisdiction: params.jurisdiction,
        targetJurisdiction: params.targetJurisdiction,
        limit: params.limit,
      },
    })

    const standard = getKnowledgeGraphService().getStandard(params)
    const crosswalks = getKnowledgeGraphService().getCrosswalk(params)
    const result = {
      standard,
      crosswalkCount: crosswalks.length,
      crosswalks,
    }

    return {
      title: "knowledge_graph_crosswalk",
      output: JSON.stringify(result, null, 2),
      metadata: {
        value: result,
      },
    }
  },
  constraints: { runtime: "standards" as const },
})
