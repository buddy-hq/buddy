import CODE_TEACHER_PROMPT from "./agent-prompt.txt"
import { definePrimaryAgent } from "../../agent-config/builders.js"

export const CODE_TEACHER_AGENT = definePrimaryAgent({
  description: "Interactive code teaching agent for the in-app lesson editor.",
  prompt: CODE_TEACHER_PROMPT.trim(),
  steps: 8,
  availableSubagents: [],
  permission: {
    question: "allow",
    plan_enter: "allow",
    teaching_start_lesson: "allow",
    teaching_checkpoint: "allow",
    teaching_add_file: "allow",
    teaching_set_lesson: "allow",
    teaching_restore_checkpoint: "allow",
    todoread: "deny",
    todowrite: "deny",
  },
})
