import BUDDY_BASE_PROMPT from "../buddy/prompt.p.md"
import MATH_BUDDY_OVERLAY from "./overlay.p.md"
import { createPrimaryAgent } from "../../agent-factories"
import { registerBuddyAgent } from "../../register-buddy-agent"

export const MATH_BUDDY = registerBuddyAgent({
  key: "math-buddy",
  agent: createPrimaryAgent({
    description: "Chat-first math Buddy persona with inline constrained geometry and unrestricted SVG figures.",
    prompt: [BUDDY_BASE_PROMPT.trim(), MATH_BUDDY_OVERLAY.trim()].join("\n\n"),
    steps: 8,
    availableSubagents: ["curriculum-orchestrator", "goal-writer", "practice-agent", "assessment-agent"],
    permission: {
      question: "allow",
      plan_enter: "allow",
      learner_snapshot_read: "allow",
      learner_practice_record: "allow",
      learner_assessment_record: "allow",
      render_figure: "allow",
      render_freeform_figure: "allow",
      teaching_start_lesson: "deny",
      teaching_checkpoint: "deny",
      teaching_add_file: "deny",
      teaching_set_lesson: "deny",
      teaching_restore_checkpoint: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
