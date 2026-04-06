import { createBuddyTool, type BuddyToolContext } from "../../tools"
import { getKnowledgeGraphService } from "../service"
import { searchStandardsParameters } from "./parameters"

export const searchStandardsTool = createBuddyTool("search_standards", {
  description: `- Search for educational standards by keyword, topic, or partial code
- Returns matching standards with descriptions, grade levels, and jurisdictions
- Use when the learner mentions a topic like "fractions" or "rigid motions" without providing an exact standard code
- Use when you need to help the learner choose from multiple possible standards
- Do NOT use if the learner already provided an exact standard code like "6.NS.B.4" - use get_standard instead

Example searches: "fractions grade 5", "linear equations", "congruence transformations", "4.NF"`,
  parameters: searchStandardsParameters,
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "search_standards",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        query: params.query,
        subject: params.subject,
        jurisdiction: params.jurisdiction,
        gradeLevel: params.gradeLevel,
      },
    })

    const results = getKnowledgeGraphService().searchStandards(params)
    return {
      title: "knowledge_graph_search_results",
      output: JSON.stringify(
        {
          query: params,
          resultCount: results.length,
          results,
        },
        null,
        2,
      ),
      metadata: {
        value: {
          query: params,
          resultCount: results.length,
          results,
        },
      },
    }
  },
})
