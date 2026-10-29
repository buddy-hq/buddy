import type { NotebookPlan } from "./notebook-plan"
import type { ModelSelection } from "./common"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"

export type AgentSummary = {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly mode: "primary" | "subagent" | "all"
  readonly hidden: boolean
  readonly model?: ModelSelection
}

export type SkillSummary = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly path: string
  readonly content: string
}

export type ExecutableCommand = {
  readonly name: string
  readonly description?: string
  readonly source: "command" | "skill"
}

export interface Catalog {
  publishNotebookPlan(directory: string, plan: NotebookPlan): Promise<string>
  activeNotebookDirectories(): Promise<string[]>
  syncActiveNotebookLocations(directory: string, revision: string, options?: { force?: boolean }): Promise<void>
  syncNotebookLocation(directory: string, revision: string, options?: { force?: boolean }): Promise<void>
  awaitNotebookPlan(directory: string): Promise<void>
  agents(directory: string): Promise<AgentSummary[]>
  agentRules(directory: string, agentID: string): Promise<PermissionRuleset>
  skills(directory: string): Promise<SkillSummary[]>
  commands(directory: string): Promise<ExecutableCommand[]>
}
