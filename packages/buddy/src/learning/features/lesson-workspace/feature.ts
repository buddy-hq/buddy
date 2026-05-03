import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { teachingStartLessonTool } from "./tools/start-lesson"
import { teachingCheckpointTool } from "./tools/checkpoint"
import { teachingAddFileTool } from "./tools/add-file"
import { teachingSetLessonTool } from "./tools/set-lesson"
import { teachingRestoreCheckpointTool } from "./tools/restore-checkpoint"

export const lessonWorkspaceFeature = defineBuddyFeature({
  id: "lesson-workspace",
  tools: [
    teachingStartLessonTool,
    teachingCheckpointTool,
    teachingAddFileTool,
    teachingSetLessonTool,
    teachingRestoreCheckpointTool,
  ],
  skills: [],
  subagents: [],
  surfaces: ["editor"],
})
