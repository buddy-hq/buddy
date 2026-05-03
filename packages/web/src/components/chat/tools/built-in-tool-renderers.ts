import { renderApplyPatchTool } from "./render/apply-patch"
import { renderBashTool } from "./render/bash"
import { renderBuddyCustomTool } from "./render/buddy-custom"
import { renderEditTool } from "./render/edit"
import { renderExaSearchTool } from "./render/exa-search"
import { renderGenericTool } from "./render/generic"
import { renderKnowledgeGraphTool } from "./render/knowledge-graph"
import { renderRenderMermaidTool } from "./render/mermaid"
import { renderPythonCalculatorTool } from "./render/python-calculator"
import { renderQuestionTool } from "./render/question"
import { renderSavedQuestionSetTool } from "./render/question-set/saved-question-set-tool"
import { renderReadTool } from "./render/read"
import { renderRenderFigureTool } from "./render/render-figure"
import { renderSearchTool } from "./render/search"
import { renderSkillTool } from "./render/skill"
import { renderTaskTool } from "./render/task"
import { renderWebfetchTool } from "./render/webfetch"
import type { ToolRenderer } from "./tool-registry-types"

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}

const hiddenToolRenderer = createToolRenderer({
  hidden: true,
})

export const builtInTools: Record<string, ToolRenderer> = {
  read: createToolRenderer({
    card: renderReadTool,
    summary: {
      display: "row",
      pattern: "read",
      suppressError: true,
      aggregate: {
        key: "read",
        mode: "count-items",
        past: "Read",
        singular: "file",
        plural: "files",
      },
    },
  }),
  list: createToolRenderer({
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  glob: createToolRenderer({
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  grep: createToolRenderer({
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  edit: createToolRenderer({
    card: renderEditTool,
  }),
  write: createToolRenderer({
    card: renderEditTool,
  }),
  apply_patch: createToolRenderer({
    card: renderApplyPatchTool,
  }),
  bash: createToolRenderer({
    card: renderBashTool,
    summary: {
      display: "row",
      pattern: "command",
      aggregate: {
        key: "terminal",
        mode: "label-times",
        label: "Terminal",
        entryLabel: "title",
      },
    },
  }),
  python_calculator: createToolRenderer({
    card: renderPythonCalculatorTool,
  }),
  webfetch: createToolRenderer({
    card: renderWebfetchTool,
    summary: {
      display: "row",
      pattern: "link",
      suppressError: true,
      aggregate: {
        key: "fetch",
        mode: "label-times",
        label: "Fetch",
        entryLabel: "title",
      },
    },
  }),
  websearch: createToolRenderer({
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  codesearch: createToolRenderer({
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  task: createToolRenderer({
    card: renderTaskTool,
  }),
  skill: createToolRenderer({
    card: renderSkillTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "skill",
        mode: "count-items",
        past: "Loaded",
        singular: "skill",
        plural: "skills",
      },
    },
  }),
  render_figure: createToolRenderer({
    card: renderRenderFigureTool,
  }),
  render_freeform_figure: createToolRenderer({
    card: renderRenderFigureTool,
  }),
  render_mermaid: createToolRenderer({
    card: renderRenderMermaidTool,
  }),
  render_saved_question_set: createToolRenderer({
    card: renderSavedQuestionSetTool,
  }),
  question: createToolRenderer({
    card: renderQuestionTool,
  }),
  learning_tool_search: createToolRenderer({
    card: renderGenericTool,
    summary: {
      display: "row",
      pattern: "info",
      aggregate: {
        key: "tool-search",
        mode: "label-times",
        label: "Search Tools",
      },
    },
  }),
  learning_tool_load: createToolRenderer({
    card: renderGenericTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: { key: "tool-load", mode: "label-times", label: "Load Tools" },
    },
  }),
  search_standards: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  get_standard: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  get_learning_components: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  get_prerequisites: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  get_next_standards: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  get_crosswalk: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  query_standards_sql: createToolRenderer({
    card: renderKnowledgeGraphTool,
    summary: {
      display: "row",
      pattern: "info",
      suppressError: true,
      aggregate: {
        key: "knowledge-graph",
        mode: "label-times",
        label: "Knowledge Graph",
      },
    },
  }),
  ingest_full_text: createToolRenderer({
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "info", suppressError: true },
  }),
  prepare_resource: createToolRenderer({
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "info", suppressError: true },
  }),
  reflection: createToolRenderer({
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "info", suppressError: true },
  }),
  learner_memory_search: createToolRenderer({
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "info", suppressError: true },
  }),
  learner_memory_update: createToolRenderer({
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "info", suppressError: true },
  }),
  todowrite: hiddenToolRenderer,
  todoread: hiddenToolRenderer,
}
