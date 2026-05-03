import CURRICULUM_ORCHESTRATOR_PROMPT from "./orchestrator.md"
import { defineBuddySubagent } from "../../../runtime/define-buddy-subagent"

export const CURRICULUM_ORCHESTRATOR = defineBuddySubagent({
  key: "curriculum-orchestrator",
  description: "Routes curriculum work to goals, practice, assessment, and learner-state services.",
  prompt: CURRICULUM_ORCHESTRATOR_PROMPT,
  permission: {
    "*": "deny",
    learner_memory_search: "allow",
    learner_memory_update: "allow",
    task: {
      "*": "deny",
      "goal-writer": "allow",
      "practice-agent": "allow",
      "assessment-agent": "allow",
    },
  },
})
