import z from "zod"
import { PermissionNext as AdapterPermissionNext } from "@buddy/opencode-adapter/permission"
import {
  Tool as AdapterTool,
  Truncate as AdapterTruncate,
  type ToolContext,
} from "@buddy/opencode-adapter/tool"

type PermissionAction = "allow" | "deny" | "ask"

type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

type PermissionRuleset = PermissionRule[]

type PermissionNextNamespace = {
  Ruleset: z.ZodType<PermissionRuleset>
  fromConfig(permission: unknown): PermissionRuleset
  merge(...rulesets: PermissionRuleset[]): PermissionRuleset
}

type ToolDefinition = {
  description: string
  parameters: z.ZodTypeAny
  execute(args: unknown, ctx: ToolContext): Promise<unknown> | unknown
}

type ToolFactory = (initCtx: unknown) => Promise<ToolDefinition> | ToolDefinition

type ToolNamespace = {
  define(id: string, init: ToolDefinition | ToolFactory): unknown
}

type TruncateNamespace = {
  GLOB: string
}

// Thin compile-safe wrappers for vendored OpenCode types/utilities.
export const PermissionNext = AdapterPermissionNext as unknown as PermissionNextNamespace
export const Tool = AdapterTool as unknown as ToolNamespace
export const Truncate = AdapterTruncate as unknown as TruncateNamespace

export type { ToolContext }
