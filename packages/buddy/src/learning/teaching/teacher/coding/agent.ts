import { createPrimaryAgent } from "../../../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../../../agent-kit/register-buddy-agent.js"
import BUDDY_BASE_PROMPT from "../../../companion/buddy-base.p.md"
import CODE_BUDDY_OVERLAY from "./code-buddy-overlay.p.md"

export const CODE_BUDDY = registerBuddyAgent({
  key: "code-buddy",
  agent: createPrimaryAgent({
    description: "Interactive code Buddy mode for the in-app lesson editor.",
    prompt: [BUDDY_BASE_PROMPT.trim(), CODE_BUDDY_OVERLAY.trim()].join("\n\n"),
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
  }),
})
