import BUDDY_BASE_PROMPT from "../buddy/buddy.p.md"
import MATH_BUDDY_OVERLAY from "./overlay.p.md"
import { createPrimaryAgent } from "../../agent-factories"
import { registerBuddyAgent } from "../../register-buddy-agent"

export const MATH_BUDDY = registerBuddyAgent({
  key: "math-buddy",
  agent: createPrimaryAgent({
    description:
      "Chat-first math Buddy persona with inline constrained geometry and unrestricted SVG figures.",
    prompt: [BUDDY_BASE_PROMPT.trim(), MATH_BUDDY_OVERLAY.trim()].join("\n\n"),
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
      search_standards: "allow",
      get_standard: "allow",
      get_learning_components: "allow",
      get_prerequisites: "allow",
      get_next_standards: "allow",
      get_crosswalk: "allow",
      query_standards_sql: "allow",
      render_figure: "allow",
      render_freeform_figure: "allow",
      render_mermaid: "allow",
      python_calculator: "allow",
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
