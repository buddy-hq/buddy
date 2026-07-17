import { createElement } from "react"
import {
  AppWindow,
  BookOpen,
  Bot,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  ListChecksIcon,
  Image,
  ListTodo,
  Network,
  Presentation,
  ScanText,
  Search,
  Sigma,
  SquarePen,
  Terminal,
  Wrench,
} from "@/icons/app-icons"

import { renderApplyPatchTool } from "./render/apply-patch"
import { renderBashTool } from "./render/bash"
import { renderBuddyCustomTool } from "./render/buddy-custom"
import { renderIngestFullTextTool } from "./render/ingest-full-text"
import { renderEditTool } from "./render/edit"
import { renderExaSearchTool } from "./render/exa-search"
import { renderSavedFlashcardDeckTool } from "./render/flashcard-deck/saved-flashcard-deck-tool"
import { renderGenericTool } from "./render/generic"
import { renderPresentHtmlWidgetTool } from "./render/html-widget"
import { renderKnowledgeGraphTool } from "./render/knowledge-graph"
import { renderRenderMermaidTool } from "@/components/media/renderers/mermaid"
import { renderPythonCalculatorTool } from "./render/python-calculator"
import { renderQuestionTool } from "./render/question"
import { renderSavedQuestionSetTool } from "./render/question-set/saved-question-set-tool"
import { renderPresentMediaTool } from "./render/present-media"
import { renderReadTool } from "./render/read"
import { renderRenderFigureTool } from "./render/render-figure"
import { renderSearchTool } from "./render/search"
import { renderSkillTool } from "./render/skill"
import { renderTaskTool } from "./render/task"
import { renderTodoTool } from "./render/todo"
import { renderWebfetchTool } from "./render/webfetch"
import { SKILL_TOOL_ICON } from "./tool-icons"
import type { ToolRenderer } from "./tool-registry-types"

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}

const hiddenToolRenderer = createToolRenderer({
  hidden: true,
})

const mediaPresentationToolRenderer = createToolRenderer({
  inline: true,
  renderInlineErrorCard: true,
  icon: (cn) => createElement(Image, { className: cn }),
  card: renderPresentMediaTool,
})

export const builtInTools: Record<string, ToolRenderer> = {
  read: createToolRenderer({
    icon: (cn) => createElement(ScanText, { className: cn }),
    card: renderReadTool,
    summary: {
      display: "card",
      pattern: "read",
      suppressError: true,
      countSummary: { verb: "Read", singular: "file", plural: "files" },
    },
  }),
  list: createToolRenderer({
    icon: (cn) => createElement(FolderOpen, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      countSummary: { verb: "Listed", singular: "directory", plural: "directories" },
    },
  }),
  glob: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      countSummary: { verb: "Searched", singular: "pattern", plural: "patterns" },
    },
  }),
  grep: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      countSummary: { verb: "Searched", singular: "pattern", plural: "patterns" },
    },
  }),
  edit: createToolRenderer({
    icon: (cn) => createElement(SquarePen, { className: cn }),
    card: renderEditTool,
    summary: {
      display: "card",
      pattern: "info",
      countSummary: { verb: "Edited", singular: "file", plural: "files" },
    },
  }),
  write: createToolRenderer({
    icon: (cn) => createElement(SquarePen, { className: cn }),
    card: renderEditTool,
    summary: {
      display: "card",
      pattern: "info",
      countSummary: { verb: "Edited", singular: "file", plural: "files" },
    },
  }),
  apply_patch: createToolRenderer({
    icon: (cn) => createElement(SquarePen, { className: cn }),
    card: renderApplyPatchTool,
    summary: {
      display: "card",
      pattern: "info",
      countSummary: { verb: "Edited", singular: "file", plural: "files" },
    },
  }),
  bash: createToolRenderer({
    icon: (cn) => createElement(Terminal, { className: cn }),
    card: renderBashTool,
    summary: {
      display: "card",
      pattern: "command",
      countSummary: { verb: "Ran", singular: "command", plural: "commands" },
    },
  }),
  python_calculator: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(Sigma, { className: cn }),
    card: renderPythonCalculatorTool,
  }),
  webfetch: createToolRenderer({
    icon: (cn) => createElement(Globe, { className: cn }),
    card: renderWebfetchTool,
    summary: {
      display: "card",
      pattern: "link",
      suppressError: true,
      countSummary: { verb: "Fetched", singular: "page", plural: "pages" },
    },
  }),
  websearch: createToolRenderer({
    icon: (cn) => createElement(Globe, { className: cn }),
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      countSummary: { verb: "Searched", singular: "query", plural: "queries" },
    },
  }),
  codesearch: createToolRenderer({
    icon: (cn) => createElement(Search, { className: cn }),
    card: renderExaSearchTool,
    summary: {
      display: "card",
      pattern: "query",
      countSummary: { verb: "Searched", singular: "query", plural: "queries" },
    },
  }),
  task: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(Bot, { className: cn }),
    card: renderTaskTool,
  }),
  skill: createToolRenderer({
    icon: SKILL_TOOL_ICON,
    card: renderSkillTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
      countSummary: { verb: "Loaded", singular: "skill", plural: "skills" },
    },
  }),
  render_figure: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(Image, { className: cn }),
    card: renderRenderFigureTool,
  }),
  render_freeform_figure: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(Image, { className: cn }),
    card: renderRenderFigureTool,
  }),
  render_mermaid: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(GitBranch, { className: cn }),
    card: renderRenderMermaidTool,
  }),
  save_question_set: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(BookOpen, { className: cn }),
    card: renderSavedQuestionSetTool,
  }),
  save_flashcard_deck: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(BookOpen, { className: cn }),
    card: renderSavedFlashcardDeckTool,
  }),
  imagegen: mediaPresentationToolRenderer,
  present_media: mediaPresentationToolRenderer,
  present_html_widget: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(AppWindow, { className: cn }),
    card: renderPresentHtmlWidgetTool,
  }),
  question: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(ListChecksIcon, { className: cn }),
    card: renderQuestionTool,
  }),
  learning_tool_search: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: {
      display: "card",
      pattern: "info",
    },
  }),
  learning_tool_load: createToolRenderer({
    icon: (cn) => createElement(Wrench, { className: cn }),
    card: renderGenericTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
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
    },
  }),
  get_standard: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  get_learning_components: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  get_prerequisites: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  get_next_standards: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  get_crosswalk: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  query_standards_sql: createToolRenderer({
    icon: (cn) => createElement(Network, { className: cn }),
    card: renderKnowledgeGraphTool,
    summary: {
      display: "card",
      pattern: "info",
      suppressError: true,
    },
  }),
  ingest_full_text: createToolRenderer({
    inline: true,
    renderInlineErrorCard: true,
    icon: (cn) => createElement(FileText, { className: cn }),
    card: renderIngestFullTextTool,
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
  whiteboard_create_view: createToolRenderer({
    icon: (cn) => createElement(Presentation, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "metadata", suppressError: true },
  }),
  whiteboard_read_context: createToolRenderer({
    icon: (cn) => createElement(Presentation, { className: cn }),
    card: renderBuddyCustomTool,
    summary: { display: "row", pattern: "metadata", suppressError: true },
  }),
  todowrite: createToolRenderer({
    inline: true,
    icon: (cn) => createElement(ListTodo, { className: cn }),
    card: renderTodoTool,
  }),
  todoread: hiddenToolRenderer,
}
