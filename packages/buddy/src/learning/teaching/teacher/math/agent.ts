import { createPrimaryAgent } from "../../../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../../../agent-kit/register-buddy-agent.js"
import BUDDY_BASE_PROMPT from "../../../companion/buddy-base.p.md"
import MATH_BUDDY_OVERLAY from "./math-buddy-overlay.p.md"

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
