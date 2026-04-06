import { createBuddyTool, type BuddyToolContext } from "../../tools"
import { getKnowledgeGraphService } from "../service"
import { resolveStandardParameters } from "./parameters"

export const getStandardTool = createBuddyTool("get_standard", {
  description: `- Look up a specific educational standard by its code
- Returns the full standard description, parent/child hierarchy, and alternative matches
- Use when the learner provides an exact standard code like "6.NS.B.4" or "HSG-CO.B.6"
- Use when you need to verify what a standard code means before creating learning goals
- Do NOT use for topic searches without a code - use search_standards instead

Example codes: "6.NS.B.4", "HSG-CO.B.6", "3.NF.A.1", "8.G.A.2"`,
  parameters: resolveStandardParameters,
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
})
