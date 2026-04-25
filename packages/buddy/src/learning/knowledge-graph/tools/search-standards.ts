import SEARCH_STANDARDS_DESCRIPTION from "./search-standards.md"
import {
  createBuddyTool,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolContext,
} from "../../tools/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { searchStandardsParameters } from "./parameters"

export const searchStandardsTool = createBuddyTool(
  "search_standards",
  {
    description: SEARCH_STANDARDS_DESCRIPTION,
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
  },
  {
    runtimeDependency: STANDARDS_RUNTIME_DEPENDENCY,
  },
)
