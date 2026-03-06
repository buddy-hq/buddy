import { createSubagent } from "../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../agent-kit/register-buddy-agent.js"
import CURRICULUM_ORCHESTRATOR_PROMPT from "./curriculum-orchestrator.p.md"

export const CURRICULUM_ORCHESTRATOR = registerBuddyAgent({
  key: "curriculum-orchestrator",
  agent: createSubagent({
    description: "Routes curriculum work to goals, practice, assessment, and learner-state services.",
    prompt: CURRICULUM_ORCHESTRATOR_PROMPT.trim(),
    steps: 8,
    permission: {
      "*": "deny",
      curriculum_read: "allow",
      curriculum_update: "deny",
      learner_state_query: "allow",
      task: {
        "*": "deny",
        "goal-writer": "allow",
        "practice-agent": "allow",
        "assessment-agent": "allow",
      },
    },
  }),
})
