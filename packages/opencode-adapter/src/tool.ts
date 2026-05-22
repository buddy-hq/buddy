import type * as OpenCodeAgent from "opencode/agent/agent"
import type * as OpenCodeTruncate from "opencode/tool/truncate"

import { ApplyPatchTool } from "opencode/tool/apply_patch"
import { EditTool } from "opencode/tool/edit"
import { GlobTool } from "opencode/tool/glob"
import { GrepTool } from "opencode/tool/grep"
import { InvalidTool } from "opencode/tool/invalid"
import { LspTool } from "opencode/tool/lsp"
import { PlanExitTool } from "opencode/tool/plan"
import { QuestionTool } from "opencode/tool/question"
import { ReadTool } from "opencode/tool/read"
import { RepoCloneTool } from "opencode/tool/repo_clone"
import { RepoOverviewTool } from "opencode/tool/repo_overview"
import { ShellTool } from "opencode/tool/shell"
import { SkillTool } from "opencode/tool/skill"
import { TaskTool } from "opencode/tool/task"
import { TaskStatusTool } from "opencode/tool/task_status"
import { TodoWriteTool } from "opencode/tool/todo"
import { WebFetchTool } from "opencode/tool/webfetch"
import { WebSearchTool } from "opencode/tool/websearch"
import { WriteTool } from "opencode/tool/write"

export type OpenCodeToolID =
  | typeof ApplyPatchTool.id
  | typeof EditTool.id
  | typeof GlobTool.id
  | typeof GrepTool.id
  | typeof InvalidTool.id
  | typeof LspTool.id
  | typeof PlanExitTool.id
  | typeof QuestionTool.id
  | typeof ReadTool.id
  | typeof RepoCloneTool.id
  | typeof RepoOverviewTool.id
  | typeof ShellTool.id
  | typeof SkillTool.id
  | typeof TaskTool.id
  | typeof TaskStatusTool.id
  | typeof TodoWriteTool.id
  | typeof WebFetchTool.id
  | typeof WebSearchTool.id
  | typeof WriteTool.id

export type ToolContext = {
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }): Promise<void>
}

export type ToolRuntimeServices = OpenCodeAgent.Service | OpenCodeTruncate.Service

export * as Tool from "opencode/tool/tool"
export * as ToolJsonSchema from "opencode/tool/json-schema"
export * as Truncate from "opencode/tool/truncate"
export { EditTool } from "opencode/tool/edit"
export { WriteTool } from "opencode/tool/write"
