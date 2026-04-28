import { assessmentRecordTool } from "./assessment-record"
import { practiceRecordTool } from "./practice-record"
import { learnerStateQueryTool } from "./query"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../tools/learning-tool-group-definition"

const learnerLearningToolGroup = defineLearningToolGroup({
  group: "learner",
  tools: [learnerStateQueryTool, practiceRecordTool, assessmentRecordTool],
})

const learnerTools = staticLearningTools(learnerLearningToolGroup)

export { learnerLearningToolGroup, learnerTools }
