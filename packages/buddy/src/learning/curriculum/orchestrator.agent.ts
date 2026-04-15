import CURRICULUM_ORCHESTRATOR_PROMPT from "./orchestrator.p.md"
import { defineBuddySubagent } from "../define-buddy-subagent"

export const CURRICULUM_ORCHESTRATOR = defineBuddySubagent({
  key: "curriculum-orchestrator",
  description: "Routes curriculum work to goals, practice, assessment, and learner-state services.",
  prompt: CURRICULUM_ORCHESTRATOR_PROMPT,
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
})
