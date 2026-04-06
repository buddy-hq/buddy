import { createBuddyTool, type BuddyToolContext } from "../../tools"
import { getKnowledgeGraphService } from "../service"
import { crosswalkParameters } from "./parameters"

export const getCrosswalkTool = createBuddyTool("get_crosswalk", {
  description: `- Find equivalent standards in other states or jurisdictions
- Returns standards that cover the same content in different frameworks
- Use when a learner moved from another state and needs to align their prior learning
- Use to compare standards across jurisdictions (e.g., "I learned this in Texas, what's the California equivalent?")
- Filter by target_jurisdiction to see equivalents in a specific state
- Requires a standard code - get one from search_standards or the learner first`,
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
})
