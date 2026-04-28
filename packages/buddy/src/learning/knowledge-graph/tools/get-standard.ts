import GET_STANDARD_DESCRIPTION from "./get-standard.md"
import {
  createBuddyTool,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolContext,
} from "../../tools/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { resolveStandardParameters } from "./parameters"

export const getStandardTool = createBuddyTool({
  id: "get_standard",
  description: GET_STANDARD_DESCRIPTION,
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
  capability: {
    runtimeDependency: STANDARDS_RUNTIME_DEPENDENCY,
  },
})
