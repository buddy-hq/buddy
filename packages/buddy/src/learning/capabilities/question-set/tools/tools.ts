import { saveQuestionSetTool } from "./save-question-set"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const questionSetLearningToolGroup = defineLearningToolGroup({
  group: "questionSet",
  tools: [saveQuestionSetTool],
})

const questionSetTools = staticLearningTools(questionSetLearningToolGroup)

export { questionSetLearningToolGroup, questionSetTools }
