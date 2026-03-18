import { createBuildAgent } from "../../agent-factories"
import { registerBuddyAgent } from "../../register-buddy-agent"
import BUDDY_BASE_PROMPT from "./prompt.p.md"

export const BUDDY_AGENT = registerBuddyAgent({
  key: "buddy",
  agent: createBuildAgent({
    description: "The default Buddy persona for learning conversations and project help.",
    prompt: BUDDY_BASE_PROMPT.trim(),
    steps: 8,
    availableSubagents: ["curriculum-orchestrator", "goal-writer", "practice-agent", "assessment-agent"],
    permission: {
      learner_snapshot_read: "allow",
      learner_practice_record: "allow",
      learner_assessment_record: "allow",
      python_calculator: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
