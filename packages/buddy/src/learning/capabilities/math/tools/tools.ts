import { pythonCalculatorTool } from "./python-calculator"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const mathLearningToolGroup = defineLearningToolGroup({
  group: "math",
  tools: [pythonCalculatorTool],
})

const mathTools = staticLearningTools(mathLearningToolGroup)

export { mathLearningToolGroup, mathTools }
