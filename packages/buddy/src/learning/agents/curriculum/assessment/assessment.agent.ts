import { createSubagent } from "../../core/runtime"
import { registerBuddyAgent } from "../../core/registry/register-buddy-agent"
import ASSESSMENT_AGENT_PROMPT from "./assessment.p.md"

export const ASSESSMENT_AGENT = registerBuddyAgent({
  key: "assessment-agent",
  agent: createSubagent({
    description: "Runs inline mastery checks tied to learner goals and records the evidence.",
    prompt: ASSESSMENT_AGENT_PROMPT.trim(),
    steps: 8,
    permission: {
      question: "allow",
      learner_snapshot_read: "allow",
      learner_practice_record: "deny",
      learner_assessment_record: "allow",
      curriculum_read: "allow",
      task: "deny",
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
