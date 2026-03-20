export * from "./registry"
export * from "./tool-info"
export * from "./parse-tool-state"

import { registerTool } from "./registry"

// Import all tool components
import { BashTool } from "./bash-tool"
import { ReadTool } from "./read-tool"
import { EditTool, WriteTool } from "./edit-tool"
import { ApplyPatchTool } from "./apply-patch-tool"
import { ListTool, GlobTool, GrepTool } from "./search-tools"
import { TaskTool } from "./task-tool"
import { WebfetchTool } from "./webfetch-tool"
import { WebsearchTool, CodesearchTool } from "./exa-tools"
import { RenderFigureTool } from "./render-figure-tool"
import { QuestionTool } from "./question-tool"
import { PythonCalculatorTool, SkillTool, BuddyCustomTool } from "./python-calculator-tool"
import { GenericTool } from "./generic-tool"

// Register context tools (read, list, glob, grep) - these will be grouped
registerTool({
  name: "read",
  render: ReadTool,
  isContextTool: true,
})

registerTool({
  name: "list",
  render: ListTool,
  isContextTool: true,
})

registerTool({
  name: "glob",
  render: GlobTool,
  isContextTool: true,
})

registerTool({
  name: "grep",
  render: GrepTool,
  isContextTool: true,
})

// Register other tools
registerTool({
  name: "bash",
  render: BashTool,
})

registerTool({
  name: "edit",
  render: EditTool,
})

registerTool({
  name: "write",
  render: WriteTool,
})

registerTool({
  name: "apply_patch",
  render: ApplyPatchTool,
})

registerTool({
  name: "task",
  render: TaskTool,
})

registerTool({
  name: "webfetch",
  render: WebfetchTool,
})

registerTool({
  name: "websearch",
  render: WebsearchTool,
})

registerTool({
  name: "codesearch",
  render: CodesearchTool,
})

registerTool({
  name: "render_figure",
  render: RenderFigureTool,
})

registerTool({
  name: "render_freeform_figure",
  render: RenderFigureTool,
})

registerTool({
  name: "question",
  render: QuestionTool,
})

registerTool({
  name: "python_calculator",
  render: PythonCalculatorTool,
})

registerTool({
  name: "skill",
  render: SkillTool,
})

// Hidden tools (not rendered)
registerTool({
  name: "todowrite",
  render: () => null,
})

registerTool({
  name: "todoread",
  render: () => null,
})

// Register generic fallback - this should be last
// Note: We don't register "*" because we handle unknown tools in the renderer
export { GenericTool }
