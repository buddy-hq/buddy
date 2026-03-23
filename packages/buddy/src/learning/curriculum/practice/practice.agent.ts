import { createSubagent } from "../../agent-factories"
import { registerBuddyAgent } from "../../register-buddy-agent"
import PRACTICE_AGENT_PROMPT from "./practice.p.md"

export const PRACTICE_AGENT = registerBuddyAgent({
  key: "practice-agent",
  agent: createSubagent({
    description: "Generates deliberate practice tasks aligned to learner goals and records them.",
    prompt: PRACTICE_AGENT_PROMPT.trim(),
    steps: 8,
    permission: {
      question: "allow",
      learner_snapshot_read: "allow",
      learner_practice_record: "allow",
      learner_assessment_record: "deny",
      task: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
