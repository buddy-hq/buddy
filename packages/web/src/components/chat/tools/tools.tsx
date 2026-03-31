import { registerTool } from "./registry"

import {
  renderSkillTool,
  renderBashTool,
  renderPythonCalculatorTool,
  renderReadTool,
  renderEditTool,
  renderTaskTool,
  renderApplyPatchTool,
  renderSearchTool,
  renderWebfetchTool,
  renderExaSearchTool,
  renderRenderFigureTool,
  renderRenderMermaidTool,
  renderQuestionTool,
  renderBuddyCustomTool,
  renderGenericTool,
} from "./render"

// ============================================================================
// Tool Registration
// ============================================================================

registerTool({ name: "read", render: renderReadTool, isContextTool: true })
registerTool({ name: "list", render: renderSearchTool, isContextTool: true })
registerTool({ name: "glob", render: renderSearchTool, isContextTool: true })
registerTool({ name: "grep", render: renderSearchTool, isContextTool: true })

registerTool({ name: "edit", render: renderEditTool })
registerTool({ name: "write", render: renderEditTool })
registerTool({ name: "apply_patch", render: renderApplyPatchTool })

registerTool({ name: "bash", render: renderBashTool })
registerTool({ name: "python_calculator", render: renderPythonCalculatorTool })

registerTool({ name: "webfetch", render: renderWebfetchTool })
registerTool({ name: "websearch", render: renderExaSearchTool })
registerTool({ name: "codesearch", render: renderExaSearchTool })

registerTool({ name: "task", render: renderTaskTool })
registerTool({ name: "skill", render: renderSkillTool })

registerTool({ name: "render_figure", render: renderRenderFigureTool })
registerTool({ name: "render_freeform_figure", render: renderRenderFigureTool })
registerTool({ name: "render_mermaid", render: renderRenderMermaidTool })

registerTool({ name: "question", render: renderQuestionTool })

registerTool({ name: "todowrite", render: () => null })
registerTool({ name: "todoread", render: () => null })

export { renderBuddyCustomTool as BuddyCustomTool, renderGenericTool as GenericTool }
