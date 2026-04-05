import { registerTool } from "./registry"

import { renderSkillTool } from "./render/skill"
import { renderBashTool } from "./render/bash"
import { renderPythonCalculatorTool } from "./render/python-calculator"
import { renderReadTool } from "./render/read"
import { renderEditTool } from "./render/edit"
import { renderTaskTool } from "./render/task"
import { renderApplyPatchTool } from "./render/apply-patch"
import { renderSearchTool } from "./render/search"
import { renderWebfetchTool } from "./render/webfetch"
import { renderExaSearchTool } from "./render/exa-search"
import { renderRenderFigureTool } from "./render/render-figure"
import { renderRenderMermaidTool } from "./render/mermaid"
import { renderRenderSavedQuestionSetTool } from "./render/question-set"
import { renderQuestionTool } from "./render/question"
import { renderBuddyCustomTool } from "./render/buddy-custom"
import { renderGenericTool } from "./render/generic"

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
registerTool({ name: "render_saved_question_set", render: renderRenderSavedQuestionSetTool })

registerTool({ name: "question", render: renderQuestionTool })

registerTool({ name: "todowrite", render: () => null })
registerTool({ name: "todoread", render: () => null })

export { renderBuddyCustomTool as BuddyCustomTool, renderGenericTool as GenericTool }
