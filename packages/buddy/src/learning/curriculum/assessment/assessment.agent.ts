import ASSESSMENT_AGENT_PROMPT from "./assessment.p.md"
import { defineBuddySubagent } from "../../define-buddy-subagent"

export const ASSESSMENT_AGENT = defineBuddySubagent({
  key: "assessment-agent",
  description: "Runs inline mastery checks tied to learner goals and records the evidence.",
  prompt: ASSESSMENT_AGENT_PROMPT,
  permission: {
    question: "allow",
    learner_snapshot_read: "allow",
    learner_practice_record: "deny",
    learner_assessment_record: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
