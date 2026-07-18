import GET_LEARNING_COMPONENTS_DESCRIPTION from "./get-learning-components.md"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { getKnowledgeGraphService } from "../service"
import { learningComponentsParameters } from "./parameters"

export const getLearningComponentsTool = createBuddyTool({
  id: "get_learning_components",
  description: GET_LEARNING_COMPONENTS_DESCRIPTION,
  parameters: learningComponentsParameters,
  presentation: {
    archetype: "activity",
    icon: "network",
    renderer: "knowledge-graph",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading learning components" },
      running: { action: "Reading learning components" },
      completed: { action: "Read learning components" },
      error: { action: "Failed to read learning components" },
    },
    summary: {
      category: "read-learning-components",
      pending: "Reading learning components",
      running: "Reading learning components",
      completed: "Read learning components",
      error: "Failed to read learning components",
    },
  },
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
  constraints: { runtime: "standards" as const },
})
