import { createBuddyTool, type BuddyToolContext } from "../../tools"
import { getKnowledgeGraphService } from "../service"
import { sqlQueryParameters } from "./parameters"

export const queryStandardsSqlTool = createBuddyTool("query_standards_sql", {
  description: `- Run a raw SQLite read-only query against the local standards knowledge graph database
- Use ONLY when the typed standards tools cannot answer the request
- Supports a single SELECT, WITH, PRAGMA, or EXPLAIN statement
- The database connection is read-only and results are capped by rowLimit

Prefer the typed tools first:
- search_standards for finding candidate standards
- get_standard for resolving an exact standard
- get_learning_components, get_prerequisites, get_next_standards, get_crosswalk for structured graph queries`,
  parameters: sqlQueryParameters,
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
})
