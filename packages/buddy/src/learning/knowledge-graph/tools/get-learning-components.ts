import { createBuddyTool, type BuddyToolContext } from "../../tools"
import { getKnowledgeGraphService } from "../service"
import { learningComponentsParameters } from "./parameters"

export const getLearningComponentsTool = createBuddyTool("get_learning_components", {
  description: `- Get the granular skills (learning components) that make up a standard
- Returns specific, teachable skills like "use number lines to add integers" or "identify congruent figures"
- Use to break a broad standard into specific skills for targeted practice
- Use when generating practice problems to ensure coverage of all component skills
- Requires a standard code - get one from search_standards or the learner first`,
  parameters: learningComponentsParameters,
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "get_learning_components",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        code: params.code,
        jurisdiction: params.jurisdiction,
        limit: params.limit,
      },
    })

    const standard = getKnowledgeGraphService().getStandard(params)
    const components = getKnowledgeGraphService().getLearningComponents(params)

    const result = {
      standard,
      componentCount: components.length,
      components,
    }

    return {
      title: "knowledge_graph_learning_components",
      output: JSON.stringify(result, null, 2),
      metadata: {
        value: result,
      },
    }
  },
})
