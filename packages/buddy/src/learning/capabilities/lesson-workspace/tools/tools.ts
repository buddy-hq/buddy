import { teachingAddFileTool } from "./add-file"
import { teachingCheckpointTool } from "./checkpoint"
import { teachingRestoreCheckpointTool } from "./restore-checkpoint"
import { teachingSetLessonTool } from "./set-lesson"
import { teachingStartLessonTool } from "./start-lesson"

const teachingTools = [
  teachingStartLessonTool,
  teachingCheckpointTool,
  teachingAddFileTool,
  teachingSetLessonTool,
  teachingRestoreCheckpointTool,
] as const

export { teachingTools }
