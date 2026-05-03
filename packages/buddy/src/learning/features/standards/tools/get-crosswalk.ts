import GET_CROSSWALK_DESCRIPTION from "./get-crosswalk.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { crosswalkParameters } from "./parameters"

export const getCrosswalkTool = createBuddyTool({
  id: "get_crosswalk",
  description: GET_CROSSWALK_DESCRIPTION,
  parameters: crosswalkParameters,
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
