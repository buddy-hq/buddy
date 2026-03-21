import { goalDecideScopeTool } from "./decide-scope"
import { goalCommitTool } from "./commit"
import { goalLintTool } from "./lint"
import { goalStateTool } from "./state"

const goalTools = [goalDecideScopeTool, goalLintTool, goalCommitTool, goalStateTool] as const

export { goalTools }
