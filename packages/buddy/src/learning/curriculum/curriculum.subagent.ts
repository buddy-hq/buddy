import CURRICULUM_BUILDER_PROMPT from "./curriculum.prompt.md"
import { createSubagent } from "../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../agent-kit/register-buddy-agent.js"

export const CURRICULUM_BUILDER = registerBuddyAgent({
  key: "curriculum-builder",
  agent: createSubagent({
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
  }),
})
