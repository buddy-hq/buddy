import PRACTICE_AGENT_PROMPT from "./practice.p.md"
import { defineBuddySubagent } from "../../define-buddy-subagent"

export const PRACTICE_AGENT = defineBuddySubagent({
  key: "practice-agent",
  description: "Generates deliberate practice tasks aligned to learner goals and records them.",
  prompt: PRACTICE_AGENT_PROMPT,
  permission: {
    question: "allow",
    learner_memory_search: "allow",
    learner_memory_update: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
