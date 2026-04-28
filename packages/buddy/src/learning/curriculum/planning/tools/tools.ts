import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const curriculumLearningToolGroup = defineLearningToolGroup({
  group: "curriculum",
  tools: [],
})

const curriculumTools = staticLearningTools(curriculumLearningToolGroup)

export { curriculumLearningToolGroup, curriculumTools }
