import path from "node:path"
import type { ToolContext, ToolDefinition, ToolResult } from "@opencode-ai/plugin"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Tool } from "@buddy/opencode-adapter/tool"
import z from "zod"
import type { BuddyTool, BuddyToolContext } from "../learning/runtime/create-buddy-tool"
import { ensureBuddyToolPresentationCatalog } from "./buddy-tool-presentation-catalog"
import { runCompatiblePluginAskResult } from "./plugin-ask-compat"

type TPluginExecuteArgs = Parameters<ToolDefinition["execute"]>[0]
type TPluginToolArgFields = ToolDefinition["args"]
type TPluginRuntimeContext = ToolContext & {
  callID?: string
  extra?: BuddyToolContext["extra"]
  messages?: BuddyToolContext["messages"]
}
type TPluginMessageEntry = NonNullable<BuddyToolContext["messages"]>[number]

function parseTPluginRuntimeContext(pluginCtx: ToolContext): TPluginRuntimeContext {
  return pluginCtx
}

function parseTCallID(value: string | undefined): Tool.Context["callID"] | undefined {
  const parsed = z.string().min(1).safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTMessageHistory(
  value: BuddyToolContext["messages"] | undefined,
): BuddyToolContext["messages"] {
  if (value === undefined || !Array.isArray(value)) return []
  return value.filter((entry: TPluginMessageEntry) => {
    if (entry === null || Array.isArray(entry)) return false
    if (entry.info === undefined || entry.info === null || Array.isArray(entry.info)) return false
    return true
  })
}

function parseTToolExtra(extra: BuddyToolContext["extra"]): BuddyToolContext["extra"] {
  if (extra === undefined || Array.isArray(extra)) return undefined
  return extra
}

/** OpenCode passes full tool context at runtime; the published plugin type omits these fields. */
function readRuntimePluginFields(pluginCtx: ToolContext) {
  const runtimeCtx = parseTPluginRuntimeContext(pluginCtx)
  const messages = parseTMessageHistory(runtimeCtx.messages)
  const extra = parseTToolExtra(runtimeCtx.extra)
  const callID = parseTCallID(runtimeCtx.callID)

  return { callID, extra, messages }
}

function extractZodObjectFields(parameters: z.ZodType): TPluginToolArgFields {
  if (parameters instanceof z.ZodObject) {
    return { ...parameters["shape"] }
  }

  return { input: parameters }
}

function bridgeContext(pluginCtx: ToolContext): BuddyToolContext {
  const { callID, extra, messages } = readRuntimePluginFields(pluginCtx)

  return Object.assign(
    {
      directory: pluginCtx.directory,
      sessionID: SessionID.make(pluginCtx.sessionID),
      messageID: MessageID.make(pluginCtx.messageID),
      agent: pluginCtx.agent,
      abort: pluginCtx.abort,
      messages,
      metadata: async (input: Parameters<BuddyToolContext["metadata"]>[0]) => {
        pluginCtx.metadata({
          title: input.title,
          metadata: input.metadata,
        })
      },
      ask: async (input: Parameters<BuddyToolContext["ask"]>[0]) => {
        await runCompatiblePluginAskResult(
          pluginCtx.ask({
            permission: input.permission,
            patterns: [...input.patterns],
            always: [...(input.always ?? [])],
            metadata: input.metadata ?? {},
          }),
        )
      },
    },
    callID ? { callID } : undefined,
    extra ? { extra } : undefined,
  )
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
  rawArgs: TPluginExecuteArgs,
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

export async function registerBuddyToolPresentationCatalog(directory: string) {
  const sourceTools = await loadAllBuddyPluginSourceTools()
  const outputPolicyRegistrations = sourceTools.map((tool) => {
    if (!tool.output) {
      return { id: tool.id }
    }
    return { id: tool.id, outputPolicy: tool.output }
  })
  const schemaRegistrations = sourceTools.map((tool) => {
    if (!tool.jsonSchema) {
      return { id: tool.id }
    }
    return { id: tool.id, jsonSchema: tool.jsonSchema }
  })

  await ensureBuddyToolPresentationCatalog(directory)
  ToolRegistry.registerToolOutputPolicyCatalog(directory, outputPolicyRegistrations)
  ToolRegistry.registerToolJsonSchemaCatalog(directory, schemaRegistrations)
}

function toPluginToolResult(
  tool: BuddyTool,
  result: Tool.ExecuteResult,
): Exclude<ToolResult, string> {
  return Object.assign(
    {
      title: result.title ?? tool.id,
      output: result.output,
      metadata: result.metadata ?? {},
    },
    result.attachments ? { attachments: result.attachments } : undefined,
  )
}

export function buddyToolToPluginTool(tool: BuddyTool, directory?: string): ToolDefinition {
  return {
    description: tool.description,
    args: extractZodObjectFields(tool.parameters),

    async execute(rawArgs, pluginCtx): Promise<ToolResult> {
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
