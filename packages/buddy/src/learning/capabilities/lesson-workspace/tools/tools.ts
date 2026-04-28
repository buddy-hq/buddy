import { teachingAddFileTool } from "./add-file"
import { teachingCheckpointTool } from "./checkpoint"
import { teachingRestoreCheckpointTool } from "./restore-checkpoint"
import { teachingSetLessonTool } from "./set-lesson"
import { teachingStartLessonTool } from "./start-lesson"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const teachingLearningToolGroup = defineLearningToolGroup({
  group: "teaching",
  tools: [
    teachingStartLessonTool,
    teachingCheckpointTool,
    teachingAddFileTool,
    teachingSetLessonTool,
    teachingRestoreCheckpointTool,
  ],
})

const teachingTools = staticLearningTools(teachingLearningToolGroup)

export { teachingLearningToolGroup, teachingTools }
