import MATH_TEACHER_PROMPT from "./prompt.js"
import { createPrimaryAgent } from "../../../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../../../agent-kit/register-buddy-agent.js"

export const MATH_TEACHER = registerBuddyAgent({
  key: "math-teacher",
  meta: {
    role: "teacher",
    subject: "math",
    interactiveWorkspace: false,
    teachingTools: false,
    teachingPolicyMode: "none",
    supportsInlineFigures: true,
    includeLearningCompanionBehavior: false,
    recommendedTeacherName: "math-teacher",
  },
  agent: createPrimaryAgent({
    description: "Chat-first math teaching agent that can render inline constrained geometry and unrestricted SVG figures.",
    prompt: MATH_TEACHER_PROMPT,
    steps: 8,
    availableSubagents: [],
    permission: {
      question: "allow",
      plan_enter: "allow",
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
