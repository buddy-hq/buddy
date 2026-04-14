import { createPrimaryAgent } from "../../agent-factories"
import { registerBuddyAgent } from "../../register-buddy-agent"
import BUDDY_BASE_PROMPT from "../buddy/buddy.p.md"
import CODE_BUDDY_OVERLAY from "./overlay.p.md"

export const CODE_BUDDY = registerBuddyAgent({
  key: "code-buddy",
  agent: createPrimaryAgent({
    description: "Interactive code Buddy persona for the in-app lesson editor.",
    prompt: [BUDDY_BASE_PROMPT.trim(), CODE_BUDDY_OVERLAY.trim()].join("\n\n"),
    availableSubagents: [
      "curriculum-orchestrator",
      "goal-writer",
      "practice-agent",
      "assessment-agent",
      "question-set-author",
    ],
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
      render_mermaid: "allow",
      python_calculator: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
