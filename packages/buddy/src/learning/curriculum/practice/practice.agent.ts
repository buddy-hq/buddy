import PRACTICE_AGENT_PROMPT from "./practice.p.md"
import { defineBuddySubagent } from "../../define-buddy-subagent"

export const PRACTICE_AGENT = defineBuddySubagent({
  key: "practice-agent",
  description: "Generates deliberate practice tasks aligned to learner goals and records them.",
  prompt: PRACTICE_AGENT_PROMPT,
  permission: {
    question: "allow",
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "deny",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
