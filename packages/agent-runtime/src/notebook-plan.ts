import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import type { SkillSummary } from "./catalog"
import type { JsonObject, ModelSelection } from "./common"

export type NotebookDiagnostic = {
  readonly path: string
  readonly message: string
}

export type PlanAgent = {
  readonly id: string
  readonly disable?: boolean
  readonly name?: string
  readonly model?: ModelSelection
  readonly prompt?: string
  readonly description?: string
  readonly mode?: "primary" | "subagent" | "all"
  readonly hidden?: boolean
  readonly color?: string
  readonly steps?: number
  readonly options?: JsonObject
  readonly temperature?: number
  readonly topP?: number
  readonly permissions: PermissionRuleset
}

export type PlanCost = {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number
  readonly cacheWrite?: number
  readonly fromContextTokens?: number
}

export type PlanModel = {
  readonly modelID?: string
  readonly name?: string
  readonly family?: string
  readonly npm?: string
  readonly options?: JsonObject
  readonly headers?: Readonly<Record<string, string>>
  readonly reasoningField?: string
  readonly capabilities?: {
    readonly tools?: boolean
    readonly input?: readonly string[]
    readonly output?: readonly string[]
  }
  readonly variants?: readonly { readonly id: string; readonly settings: JsonObject }[]
  readonly disabledVariants?: readonly string[]
  readonly costs?: readonly PlanCost[]
  readonly deprecated?: boolean
  readonly limit?: { readonly context: number; readonly input?: number; readonly output: number }
}

export type PlanProvider = {
  readonly id: string
  readonly name?: string
  readonly env?: readonly string[]
  readonly npm?: string
  readonly options?: JsonObject
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: JsonObject
  readonly models: Readonly<Record<string, PlanModel>>
  readonly whitelist?: readonly string[]
  readonly blacklist?: readonly string[]
}

export type PlanMcpOAuth = {
  readonly clientId?: string
  readonly clientSecret?: string
  readonly scope?: string
  readonly callbackPort?: number
  readonly redirectUri?: string
}

export type PlanMcpServer =
  | {
      readonly name: string
      readonly type: "local"
      readonly command: readonly string[]
      readonly cwd?: string
      readonly environment?: Readonly<Record<string, string>>
      readonly disabled?: boolean
      readonly timeout?: number
    }
  | {
      readonly name: string
      readonly type: "remote"
      readonly url: string
      readonly headers?: Readonly<Record<string, string>>
      readonly oauth?: false | PlanMcpOAuth
      readonly disabled?: boolean
      readonly timeout?: number
    }

export type PlanCommand = {
  readonly description?: string
  readonly template: string
}

export type NotebookPlan = {
  readonly agents: readonly PlanAgent[]
  readonly permissions: PermissionRuleset
  readonly defaultAgent?: string
  readonly model?: ModelSelection
  readonly titleModel?: ModelSelection
  readonly providers: readonly PlanProvider[]
  readonly enabledProviders?: readonly string[]
  readonly disabledProviders?: readonly string[]
  readonly mcp: readonly PlanMcpServer[]
  readonly skills: readonly SkillSummary[]
  readonly excludedSkillRoots: readonly string[]
  readonly commands: Readonly<Record<string, PlanCommand>>
  readonly diagnostics: readonly NotebookDiagnostic[]
}
