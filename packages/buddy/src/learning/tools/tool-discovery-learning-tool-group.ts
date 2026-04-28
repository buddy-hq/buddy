import { defineLearningToolGroup } from "./learning-tool-group-definition"
import { dynamicToolSearchTools } from "./dynamic-tool-search"

const toolDiscoveryLearningToolGroup = defineLearningToolGroup({
  group: "toolDiscovery",
  tools: dynamicToolSearchTools,
})

export { toolDiscoveryLearningToolGroup }
