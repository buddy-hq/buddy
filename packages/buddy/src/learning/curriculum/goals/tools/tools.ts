import { goalDecideScopeTool } from "./decide-scope"
import { goalCommitTool } from "./commit"
import { goalLintTool } from "./lint"
import { goalStateTool } from "./state"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const goalLearningToolGroup = defineLearningToolGroup({
  group: "goals",
  tools: [goalDecideScopeTool, goalLintTool, goalCommitTool, goalStateTool],
})

const goalTools = staticLearningTools(goalLearningToolGroup)

export { goalLearningToolGroup, goalTools }
