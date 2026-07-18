import SEARCH_STANDARDS_DESCRIPTION from "./search-standards.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { searchStandardsParameters } from "./parameters"

export const searchStandardsTool = createBuddyTool({
  id: "search_standards",
  description: SEARCH_STANDARDS_DESCRIPTION,
  parameters: searchStandardsParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: {
        action: "Searching standards",
        detail: ({ input }) => (typeof input.query === "string" ? input.query : undefined),
      },
      running: {
        action: "Searching standards",
        detail: ({ input }) => (typeof input.query === "string" ? input.query : undefined),
      },
      completed: {
        action: "Searched standards",
        detail: ({ input }) => (typeof input.query === "string" ? input.query : undefined),
      },
      error: {
        action: "Failed to search standards",
        detail: ({ input }) => (typeof input.query === "string" ? input.query : undefined),
      },
    },
    summary: {
      category: "search-standards",
      pending: "Searching standards",
      running: "Searching standards",
      completed: "Searched standards",
      error: "Failed to search standards",
    },
  },
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
  constraints: { runtime: "standards" as const },
})
