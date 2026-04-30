import ASSESSMENT_AGENT_PROMPT from "./assessment.p.md"
import { defineBuddySubagent } from "../../define-buddy-subagent"

export const ASSESSMENT_AGENT = defineBuddySubagent({
  key: "assessment-agent",
  description: "Runs inline mastery checks tied to learner goals and records the evidence.",
  prompt: ASSESSMENT_AGENT_PROMPT,
  permission: {
    question: "allow",
    learner_memory_search: "allow",
    learner_memory_update: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
