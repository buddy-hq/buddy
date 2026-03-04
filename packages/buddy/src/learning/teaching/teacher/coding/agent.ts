import CODE_TEACHER_PROMPT from "./prompt.js"
import { createPrimaryAgent } from "../../../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../../../agent-kit/register-buddy-agent.js"

export const CODING_TEACHER = registerBuddyAgent({
  key: "code-teacher",
  meta: {
    role: "teacher",
    subject: "coding",
    interactiveWorkspace: true,
    teachingTools: true,
    teachingPolicyMode: "interactive",
    supportsInlineFigures: false,
    includeLearningCompanionBehavior: false,
    recommendedTeacherName: "code-teacher",
  },
  agent: createPrimaryAgent({
    description: "Interactive code teaching agent for the in-app lesson editor.",
    prompt: CODE_TEACHER_PROMPT,
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
