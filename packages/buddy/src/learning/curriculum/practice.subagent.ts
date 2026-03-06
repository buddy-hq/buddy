import { createSubagent } from "../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../agent-kit/register-buddy-agent.js"
import PRACTICE_AGENT_PROMPT from "./practice-agent.p.md"

export const PRACTICE_AGENT = registerBuddyAgent({
  key: "practice-agent",
  agent: createSubagent({
    description: "Generates deliberate practice tasks aligned to learner goals and records them.",
    prompt: PRACTICE_AGENT_PROMPT.trim(),
    steps: 8,
    permission: {
      question: "allow",
      learner_state_query: "allow",
      practice_record: "allow",
      assessment_record: "deny",
      curriculum_read: "allow",
      curriculum_update: "deny",
      task: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
