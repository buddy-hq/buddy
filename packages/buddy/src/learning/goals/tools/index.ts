import { goalDecideScopeTool } from "./decide-scope.js"
import { goalCommitTool } from "./commit.js"
import { goalLintTool } from "./lint.js"
import { goalStateTool } from "./state.js"

const goalTools = [
  goalDecideScopeTool,
  goalLintTool,
  goalCommitTool,
  goalStateTool,
] as const

export { goalTools }
