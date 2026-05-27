import path from "node:path"
import type { ToolContext, ToolDefinition, ToolResult } from "@opencode-ai/plugin"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Tool } from "@buddy/opencode-adapter/tool"
import z from "zod"
import type { BuddyTool, BuddyToolContext } from "../learning/runtime/create-buddy-tool"
import { runCompatiblePluginAskResult } from "./plugin-ask-compat"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMessageHistory(value: unknown): value is Tool.Context["messages"] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => isRecord(entry) && isRecord(entry.info))
}

function readOwnProperty(value: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key) ? Reflect.get(value, key) : undefined
}

/** OpenCode passes full tool context at runtime; the published plugin type omits these fields. */
function readRuntimePluginFields(pluginCtx: ToolContext): {
  callID: Tool.Context["callID"]
  extra: Tool.Context["extra"]
  messages: Tool.Context["messages"]
} {
  const messagesUnknown = readOwnProperty(pluginCtx, "messages")
  const extraUnknown = readOwnProperty(pluginCtx, "extra")
  const callIDUnknown = readOwnProperty(pluginCtx, "callID")

  const messages = isMessageHistory(messagesUnknown) ? messagesUnknown : []
  const extra = isRecord(extraUnknown) ? extraUnknown : undefined
  const callID =
    typeof callIDUnknown === "string" && callIDUnknown.length > 0
      ? (callIDUnknown as Tool.Context["callID"])
      : undefined

  return { callID, extra, messages }
}

function extractZodShape(parameters: z.ZodType): z.ZodRawShape {
  if (parameters instanceof z.ZodObject) {
    return { ...parameters.shape } as z.ZodRawShape
  }

  return { input: parameters }
}

function bridgeContext(pluginCtx: ToolContext): BuddyToolContext {
  const { callID, extra, messages } = readRuntimePluginFields(pluginCtx)

  return {
    directory: pluginCtx.directory,
    sessionID: SessionID.make(pluginCtx.sessionID),
    messageID: MessageID.make(pluginCtx.messageID),
    agent: pluginCtx.agent,
    abort: pluginCtx.abort,
    ...(callID ? { callID } : {}),
    ...(extra ? { extra } : {}),
    messages,
    metadata: async (input) => {
      pluginCtx.metadata({
        title: input.title,
        metadata: input.metadata,
      })
    },
    ask: async (input) => {
      await runCompatiblePluginAskResult(
        pluginCtx.ask({
          permission: input.permission,
          patterns: [...input.patterns],
          always: [...(input.always ?? [])],
          metadata: input.metadata ?? {},
        }),
      )
    },
  }
}

function normalizeDirectory(directory: string) {
  return path.resolve(directory)
}

function readCurrentInstanceDirectory(): string | undefined {
  try {
    return OpenCodeInstance.current.directory
  } catch {
    return undefined
  }
}

async function executeBuddyTool(
  tool: BuddyTool,
  directory: string,
  rawArgs: unknown,
  buddyCtx: BuddyToolContext,
): Promise<Tool.ExecuteResult> {
  const run = () => tool.run(rawArgs, buddyCtx)
  const currentDirectory = readCurrentInstanceDirectory()
  if (
    currentDirectory !== undefined &&
    normalizeDirectory(currentDirectory) === normalizeDirectory(directory)
  ) {
    return await run()
  }

  return OpenCodeInstance.provide({
    directory,
    fn: run,
  })
}

async function loadBuddyToolCollections(): Promise<{
  featureTools: BuddyTool[]
  dynamicTools: readonly BuddyTool[]
}> {
  const { allBuddyTools } = await import("../learning/runtime/feature-registry")
  const featureTools = allBuddyTools()
  const { getDynamicToolSearchTools } = await import("../learning/runtime/dynamic-tool-discovery")

  return {
    featureTools,
    dynamicTools: getDynamicToolSearchTools(),
  }
}

async function loadAllBuddyPluginSourceTools(): Promise<BuddyTool[]> {
  const { featureTools, dynamicTools } = await loadBuddyToolCollections()
  return [...featureTools, ...dynamicTools]
}

export async function registerBuddyToolUiCatalog(directory: string) {
  const registrations = (await loadAllBuddyPluginSourceTools()).map((tool) => {
    if (!tool.ui) {
      return { id: tool.id }
    }
    return { id: tool.id, toolUi: tool.ui }
  })
  ToolRegistry.registerToolUiCatalog(directory, registrations)
}

function toPluginToolResult(
  tool: BuddyTool,
  result: Tool.ExecuteResult,
): Exclude<ToolResult, string> {
  return {
    title: result.title ?? tool.id,
    output: result.output,
    metadata: result.metadata ?? {},
    ...(result.attachments ? { attachments: result.attachments } : {}),
  }
}

export function buddyToolToPluginTool(tool: BuddyTool, directory?: string): ToolDefinition {
  return {
    description: tool.description,
    args: extractZodShape(tool.parameters),

    async execute(rawArgs: unknown, pluginCtx: ToolContext): Promise<ToolResult> {
      const resolvedDirectory = pluginCtx.directory || directory || ""
      const buddyCtx = bridgeContext({
        ...pluginCtx,
        directory: resolvedDirectory,
      })
      const result = await executeBuddyTool(tool, resolvedDirectory, rawArgs, buddyCtx)
      return toPluginToolResult(tool, result)
    },
  } satisfies ToolDefinition
}

export async function allBuddyPluginTools(
  directory: string,
): Promise<Record<string, ToolDefinition>> {
  const toolMap: Record<string, ToolDefinition> = {}
  const seen = new Set<string>()

  for (const tool of await loadAllBuddyPluginSourceTools()) {
    if (seen.has(tool.id)) {
      throw new Error(`Duplicate Buddy tool id "${tool.id}" in plugin export`)
    }
    seen.add(tool.id)
    toolMap[tool.id] = buddyToolToPluginTool(tool, directory)
  }

  return toolMap
}
