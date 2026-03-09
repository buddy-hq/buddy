import { createPrimaryAgent } from "../runtime"
import { registerBuddyAgent } from "../registry/register-buddy-agent"
import BUDDY_BASE_PROMPT from "../buddy/prompt.p.md"
import CODE_BUDDY_OVERLAY from "./overlay.p.md"

export const CODE_BUDDY = registerBuddyAgent({
  key: "code-buddy",
  agent: createPrimaryAgent({
    description: "Interactive code Buddy persona for the in-app lesson editor.",
    prompt: [BUDDY_BASE_PROMPT.trim(), CODE_BUDDY_OVERLAY.trim()].join("\n\n"),
    steps: 8,
    availableSubagents: ["curriculum-orchestrator", "goal-writer", "practice-agent", "assessment-agent"],
    permission: {
      question: "allow",
      plan_enter: "allow",
      learner_snapshot_read: "allow",
      learner_practice_record: "allow",
      learner_assessment_record: "allow",
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
