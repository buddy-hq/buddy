import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../tools/learning-tool-group-definition"
import { learnerMemorySearchTool } from "./search"
import { learnerMemoryUpdateTool } from "./update"

const learnerMemoryLearningToolGroup = defineLearningToolGroup({
  group: "learner",
  tools: [learnerMemorySearchTool, learnerMemoryUpdateTool],
})

const learnerMemoryTools = staticLearningTools(learnerMemoryLearningToolGroup)

export { learnerMemoryLearningToolGroup, learnerMemoryTools }
