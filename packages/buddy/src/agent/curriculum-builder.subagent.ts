import CURRICULUM_BUILDER_PROMPT from "./prompts/curriculum-builder.txt"
import { defineSubagent } from "./define.js"

export const CURRICULUM_BUILDER_SUBAGENT = defineSubagent({
  description: "Builds and updates project curriculum markdown with actionable checklists.",
  prompt: CURRICULUM_BUILDER_PROMPT.trim(),
  steps: 8,
  permission: {
    "*": "deny",
    read: "allow",
    list: "allow",
    write: "allow",
    webfetch: "allow",
    curriculum_read: "allow",
    curriculum_update: "allow",
    task: "deny",
  },
})
