import { goalDecideScopeTool } from "./decide-goal-scope"
import { goalCommitTool } from "./commit-goal"
import { goalLintTool } from "./lint-goal"
import { goalStateTool } from "./goal-state"

const goalTools = [goalDecideScopeTool, goalLintTool, goalCommitTool, goalStateTool] as const

export { goalTools }
