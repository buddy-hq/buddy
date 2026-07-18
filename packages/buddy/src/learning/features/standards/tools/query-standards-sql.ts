import QUERY_STANDARDS_SQL_DESCRIPTION from "./query-standards-sql.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { sqlQueryParameters } from "./parameters"

export const queryStandardsSqlTool = createBuddyTool({
  id: "query_standards_sql",
  description: QUERY_STANDARDS_SQL_DESCRIPTION,
  parameters: sqlQueryParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Querying standards" },
      running: { action: "Querying standards" },
      completed: { action: "Queried standards" },
      error: { action: "Failed to query standards" },
    },
    summary: {
      category: "query-standards",
      pending: "Querying standards",
      running: "Querying standards",
      completed: "Queried standards",
      error: "Failed to query standards",
    },
  },
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "query_standards_sql",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        sql: params.sql,
        rowLimit: params.rowLimit,
      },
    })

    const result = getKnowledgeGraphService().runSqlQuery(params)
    return {
      title: "knowledge_graph_sql_query_results",
      output: JSON.stringify(result, null, 2),
      metadata: {
        value: result,
      },
    }
  },
  constraints: { runtime: "standards" as const },
})
