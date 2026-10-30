import type { ChatGPTAccountService, ChatGPTCredentials } from "./chatgpt"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import type { JsonObject, JsonValue } from "./common"
import type { MetadataPatch } from "./conversations"
import type { NotebookPlan } from "./notebook-plan"

export type ExtensionLocation = {
  readonly directory: string
  readonly workspaceID?: string
}

export class ExtensionError extends Error {
  readonly _tag = "ExtensionError"

  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = "ExtensionError"
  }
}

export type ToolApprovalRequest = {
  readonly permission: string
  readonly patterns: readonly string[]
  readonly always: readonly string[]
  readonly metadata: { readonly [key: string]: JsonValue | undefined }
}

export type ToolProgress = {
  readonly title?: string
  readonly metadata?: { readonly [key: string]: JsonValue | undefined }
}

export type ToolCall = {
  readonly directory: string
  readonly sessionID: string
  readonly messageID: string
  readonly agent: string
  readonly callID?: string
  readonly abort: AbortSignal
  readonly messages: MessageWithParts[]
  metadata(update: ToolProgress): Promise<void>
  ask(request: ToolApprovalRequest): Promise<void>
}

export type ToolAttachment = {
  readonly type: "file"
  readonly mime: string
  readonly url: string
  readonly filename?: string
}

export type ToolOutput = {
  readonly title: string
  readonly output: string
  readonly metadata: { readonly [key: string]: JsonValue | undefined }
  readonly attachments?: readonly ToolAttachment[]
}

export interface RuntimeTool {
  readonly id: string
  readonly description: string
  readonly streamInput?: boolean
  readonly jsonSchema: JsonObject
  readonly output?: { readonly maxLines?: number; readonly maxBytes?: number }
  run(input: JsonValue, call: ToolCall): Promise<ToolOutput>
}

export type SessionView = {
  readonly id: string
  readonly parentID?: string
  readonly agent?: string
  readonly metadata?: JsonObject
  readonly rules: PermissionRuleset
}

export interface SessionAccess {
  get(sessionID: string): Promise<SessionView>
  patchMetadata(sessionID: string, patch: MetadataPatch): Promise<void>
  setRules(sessionID: string, rules: PermissionRuleset): Promise<void>
  agentRules(agentID: string): Promise<PermissionRuleset>
  toolPermissions(): Promise<Readonly<Record<string, string>>>
}

export type TextVerbosity = "low" | "medium" | "high"

export type ModelContext = {
  readonly sessionID: string
  readonly agent: string
  readonly system: readonly string[]
  readonly tools: readonly string[]
  readonly textVerbosity?: TextVerbosity
}

export type ModelContextUpdate = {
  readonly system: readonly string[]
  readonly hiddenTools?: readonly string[]
  readonly textVerbosity?: TextVerbosity
}

export type ToolCallStart = {
  readonly tool: string
  readonly sessionID: string
  readonly input: JsonValue
}

export type PermissionHookEffect = "allow" | "ask"

export type PermissionHookInput = {
  readonly sessionID: string
  readonly action: string
  readonly resources: readonly string[]
  readonly effect: PermissionHookEffect
}

export interface ExtensionHooks {
  hydrate(sessionID: string): Promise<void>
  compaction(sessionID: string): Promise<void>
  prompt(sessionID: string): Promise<void>
  context(input: ModelContext): Promise<ModelContextUpdate>
  beforeTool(input: ToolCallStart): Promise<void>
  permission(input: PermissionHookInput): Promise<PermissionHookEffect>
}

export interface RuntimeExtension {
  tools(location: ExtensionLocation): Promise<readonly RuntimeTool[]>
  notebookPlan(directory: string): Promise<NotebookPlan>
  hooks(location: ExtensionLocation, sessions: SessionAccess): ExtensionHooks
  chatgpt(location: ExtensionLocation, credentials: ChatGPTCredentials): ChatGPTAccountService
}
