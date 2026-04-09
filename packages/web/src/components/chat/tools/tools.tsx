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
import { renderKnowledgeGraphTool } from "./render/knowledge-graph"
import { renderRenderSavedQuestionSetTool } from "./render/question-set"
import { renderQuestionTool } from "./render/question"
import { renderBuddyCustomTool } from "./render/buddy-custom"
import { renderGenericTool } from "./render/generic"
import {
  createArtifactHiddenStepPresentation,
  createReadHiddenStepPresentation,
  createSearchHiddenStepPresentation,
  createSummaryOnlyHiddenStepPresentation,
} from "./hidden-steps-presenters"

// ============================================================================
// Tool Registration
// ============================================================================

registerTool({
  name: "read",
  render: renderReadTool,
  isContextTool: true,
  hiddenSteps: createReadHiddenStepPresentation,
})
registerTool({
  name: "list",
  render: renderSearchTool,
  isContextTool: true,
  hiddenSteps: createSearchHiddenStepPresentation,
})
registerTool({
  name: "glob",
  render: renderSearchTool,
  isContextTool: true,
  hiddenSteps: createSearchHiddenStepPresentation,
})
registerTool({
  name: "grep",
  render: renderSearchTool,
  isContextTool: true,
  hiddenSteps: createSearchHiddenStepPresentation,
})

registerTool({ name: "edit", render: renderEditTool })
registerTool({ name: "write", render: renderEditTool })
registerTool({ name: "apply_patch", render: renderApplyPatchTool })

registerTool({ name: "bash", render: renderBashTool })
registerTool({ name: "python_calculator", render: renderPythonCalculatorTool })

registerTool({ name: "webfetch", render: renderWebfetchTool })
registerTool({
  name: "websearch",
  render: renderExaSearchTool,
  hiddenSteps: createSearchHiddenStepPresentation,
})
registerTool({
  name: "codesearch",
  render: renderExaSearchTool,
  hiddenSteps: createSearchHiddenStepPresentation,
})

registerTool({ name: "task", render: renderTaskTool })
registerTool({
  name: "skill",
  render: renderSkillTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})

registerTool({ name: "render_figure", render: renderRenderFigureTool })
registerTool({ name: "render_freeform_figure", render: renderRenderFigureTool })
registerTool({ name: "render_mermaid", render: renderRenderMermaidTool })
registerTool({ name: "render_saved_question_set", render: renderRenderSavedQuestionSetTool })

registerTool({ name: "question", render: renderQuestionTool })

registerTool({
  name: "search_standards",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "get_standard",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "get_learning_components",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "get_prerequisites",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "get_next_standards",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "get_crosswalk",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "query_standards_sql",
  render: renderKnowledgeGraphTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})

registerTool({
  name: "pedagogy_resource_ingest_full_text",
  render: renderBuddyCustomTool,
  hiddenSteps: createSummaryOnlyHiddenStepPresentation,
})
registerTool({
  name: "learner_snapshot_read",
  render: renderBuddyCustomTool,
  hiddenSteps: createArtifactHiddenStepPresentation,
})

registerTool({ name: "todowrite", render: () => null })
registerTool({ name: "todoread", render: () => null })

export { renderBuddyCustomTool as BuddyCustomTool, renderGenericTool as GenericTool }
