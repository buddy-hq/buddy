import { createElement } from "react"
import {
  BookOpen,
  Bot,
  Brain,
  FileText,
  FilePlus,
  FolderOpen,
  GitBranch,
  Globe,
  HelpCircle,
  Image,
  Layers,
  Network,
  PenLine,
  Search,
  Terminal,
  Wrench,
} from "lucide-react"

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
import { renderPresentMediaTool } from "./render/present-media"
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
    icon: (cn) => createElement(FileText, { className: cn }),
    card: renderReadTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(FolderOpen, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  glob: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  grep: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  edit: createToolRenderer({
    icon: (cn) => createElement(PenLine, { className: cn }),
    card: renderEditTool,
    summary: {
      display: "card",
      pattern: "info",
      aggregate: {
        key: "edit",
        mode: "count-items",
        past: "Edited",
        singular: "file",
        plural: "files",
      },
    },
  }),
  write: createToolRenderer({
    icon: (cn) => createElement(FilePlus, { className: cn }),
    card: renderEditTool,
    summary: {
      display: "card",
      pattern: "info",
      aggregate: {
        key: "write",
        mode: "count-items",
        past: "Wrote",
        singular: "file",
        plural: "files",
      },
    },
  }),
  apply_patch: createToolRenderer({
    icon: (cn) => createElement(Layers, { className: cn }),
    card: renderApplyPatchTool,
    summary: {
      display: "card",
      pattern: "info",
      aggregate: {
        key: "edit",
        mode: "count-items",
        past: "Edited",
        singular: "file",
        plural: "files",
      },
    },
  }),
  bash: createToolRenderer({
    icon: (cn) => createElement(Terminal, { className: cn }),
    card: renderBashTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderPythonCalculatorTool,
  }),
  webfetch: createToolRenderer({
    icon: (cn) => createElement(Globe, { className: cn }),
    card: renderWebfetchTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Globe, { className: cn }),
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  codesearch: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      aggregate: { key: "search", mode: "action-times", action: "Searched" },
    },
  }),
  task: createToolRenderer({
    icon: (cn) => createElement(Bot, { className: cn }),
    card: renderTaskTool,
  }),
  skill: createToolRenderer({
    icon: (cn) => createElement(Brain, { className: cn }),
    card: renderSkillTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Image, { className: cn }),
    card: renderRenderFigureTool,
  }),
  render_freeform_figure: createToolRenderer({
    icon: (cn) => createElement(Image, { className: cn }),
    card: renderRenderFigureTool,
  }),
  render_mermaid: createToolRenderer({
    icon: (cn) => createElement(GitBranch, { className: cn }),
    card: renderRenderMermaidTool,
  }),
  render_saved_question_set: createToolRenderer({
    icon: (cn) => createElement(BookOpen, { className: cn }),
    card: renderSavedQuestionSetTool,
  }),
  present_media: createToolRenderer({
    icon: (cn) => createElement(Image, { className: cn }),
    card: renderPresentMediaTool,
  }),
  question: createToolRenderer({
    icon: (cn) => createElement(HelpCircle, { className: cn }),
    card: renderQuestionTool,
  }),
  learning_tool_search: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: {
      display: "card",
      pattern: "info",
      aggregate: {
        key: "tool-search",
        mode: "label-times",
        label: "Search Tools",
      },
    },
  }),
  learning_tool_load: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
      aggregate: { key: "tool-load", mode: "label-times", label: "Load Tools" },
    },
  }),
  goal_state: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: { display: "card", pattern: "info" },
  }),
  goal_commit: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: { display: "card", pattern: "info" },
  }),
  goal_decide_scope: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: { display: "card", pattern: "info" },
  }),
  goal_lint: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: { display: "card", pattern: "info" },
  }),
  search_standards: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
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
    icon: (cn) => createElement(FileText, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "card", pattern: "info", suppressError: true },
  }),
  prepare_resource: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "card", pattern: "info", suppressError: true },
  }),
  reflection: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "card", pattern: "info", suppressError: true },
  }),
  learner_memory_search: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "card", pattern: "info", suppressError: true },
  }),
  learner_memory_update: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "card", pattern: "info", suppressError: true },
  }),
  todowrite: hiddenToolRenderer,
  todoread: hiddenToolRenderer,
}
