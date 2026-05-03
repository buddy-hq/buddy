import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { GOAL_WRITER } from "./subagents/goal-writer"
import { goalDecideScopeTool } from "./tools/decide-goal-scope"
import { goalCommitTool } from "./tools/commit-goal"
import { goalLintTool } from "./tools/lint-goal"
import { goalStateTool } from "./tools/goal-state"

export const curriculumPlanningFeature = defineBuddyFeature({
  id: "curriculum-planning",
  tools: [goalDecideScopeTool, goalLintTool, goalCommitTool, goalStateTool],
  skills: [],
  subagents: [GOAL_WRITER],
  surfaces: [],
})
