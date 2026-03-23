import { createSubagent } from "../agent-factories"
import { registerBuddyAgent } from "../register-buddy-agent"
import CURRICULUM_ORCHESTRATOR_PROMPT from "./orchestrator.p.md"

export const CURRICULUM_ORCHESTRATOR = registerBuddyAgent({
  key: "curriculum-orchestrator",
  agent: createSubagent({
    description:
      "Routes curriculum work to goals, practice, assessment, and learner-state services.",
    prompt: CURRICULUM_ORCHESTRATOR_PROMPT.trim(),
    permission: {
      "*": "deny",
      learner_snapshot_read: "allow",
      task: {
        "*": "deny",
        "goal-writer": "allow",
        "practice-agent": "allow",
        "assessment-agent": "allow",
      },
    },
  }),
})
