import { createElement } from "react"
import type {
  ToolActionIcon,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"
import {
  AppWindow,
  BookOpen,
  Bot,
  FileText,
  GitBranch,
  Globe,
  Image,
  ListChecksIcon,
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
import { renderEditTool } from "./render/edit"
import { renderExaSearchTool } from "./render/exa-search"
import { renderSavedFlashcardDeckTool } from "./render/flashcard-deck/saved-flashcard-deck-tool"
import { renderGenericTool } from "./render/generic"
import { renderPresentHtmlWidgetTool } from "./render/html-widget"
import { renderIngestFullTextTool } from "./render/ingest-full-text"
import { renderKnowledgeGraphTool } from "./render/knowledge-graph"
import { renderRenderMermaidTool } from "@/components/media/renderers/mermaid"
import { renderImageGenerationTool, renderPresentMediaTool } from "./render/present-media"
import { renderPythonCalculatorTool } from "./render/python-calculator"
import { renderQuestionTool } from "./render/question"
import { renderSavedQuestionSetTool } from "./render/question-set/saved-question-set-tool"
import { renderReadTool } from "./render/read"
import { renderRenderFigureTool } from "./render/render-figure"
import { renderSearchTool } from "./render/search"
import { renderSkillTool } from "./render/skill"
import { renderTaskTool } from "./render/task"
import { renderTodoTool } from "./render/todo"
import { renderWebfetchTool } from "./render/webfetch"
import { SKILL_TOOL_ICON } from "./tool-icons"
import type { ToolIconRenderer, ToolRenderer } from "./tool-registry-types"

export const toolRenderersByToken = {
  generic: { card: renderGenericTool },
  read: { card: renderReadTool },
  search: { card: renderSearchTool },
  edit: { card: renderEditTool },
  "apply-patch": { card: renderApplyPatchTool },
  bash: { card: renderBashTool },
  calculator: { card: renderPythonCalculatorTool },
  "web-search": { card: renderExaSearchTool },
  "web-fetch": { card: renderWebfetchTool },
  task: { card: renderTaskTool },
  skill: { card: renderSkillTool },
  figure: { card: renderRenderFigureTool },
  mermaid: { card: renderRenderMermaidTool },
  "question-set": { card: renderSavedQuestionSetTool },
  "flashcard-deck": { card: renderSavedFlashcardDeckTool },
  "image-generation": { card: renderImageGenerationTool },
  media: { card: renderPresentMediaTool },
  "html-widget": { card: renderPresentHtmlWidgetTool },
  question: { card: renderQuestionTool },
  "knowledge-graph": { card: renderKnowledgeGraphTool },
  "full-text": { card: renderIngestFullTextTool },
  "buddy-custom": { card: renderBuddyCustomTool },
  todo: { card: renderTodoTool },
} satisfies Record<ToolRendererToken, ToolRenderer>

export const toolIconsByToken = {
  tool: (className) => createElement(Wrench, { className }),
  read: (className) => createElement(ScanText, { className }),
  edit: (className) => createElement(SquarePen, { className }),
  search: (className) => createElement(Search, { className }),
  terminal: (className) => createElement(Terminal, { className }),
  web: (className) => createElement(Globe, { className }),
  skill: SKILL_TOOL_ICON,
  subagent: (className) => createElement(Bot, { className }),
  question: (className) => createElement(ListChecksIcon, { className }),
  image: (className) => createElement(Image, { className }),
  diagram: (className) => createElement(GitBranch, { className }),
  presentation: (className) => createElement(Presentation, { className }),
  calculator: (className) => createElement(Sigma, { className }),
  todo: (className) => createElement(ListTodo, { className }),
  file: (className) => createElement(FileText, { className }),
  network: (className) => createElement(Network, { className }),
  widget: (className) => createElement(AppWindow, { className }),
  memory: (className) => createElement(BookOpen, { className }),
  book: (className) => createElement(BookOpen, { className }),
  goal: (className) => createElement(ListChecksIcon, { className }),
} satisfies Record<ToolActionIcon, ToolIconRenderer>
