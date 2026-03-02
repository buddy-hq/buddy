import { teachingAddFileTool } from "./add-file.js"
import { teachingCheckpointTool } from "./checkpoint.js"
import { teachingRestoreCheckpointTool } from "./restore-checkpoint.js"
import { teachingSetLessonTool } from "./set-lesson.js"
import { teachingStartLessonTool } from "./start-lesson.js"

const teachingTools = [
  teachingStartLessonTool,
  teachingCheckpointTool,
  teachingAddFileTool,
  teachingSetLessonTool,
  teachingRestoreCheckpointTool,
] as const

export { teachingTools }
