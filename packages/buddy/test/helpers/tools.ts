import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { Tool } from "@buddy/opencode-adapter/tool"

type ToolList = Awaited<ReturnType<typeof ToolRegistry.tools>>
type RuntimeTool = ToolList[number]

type ToolContextInput = {
  sessionID: string
  messageID: string
  agent: string
}

export function createToolContext(input: ToolContextInput): Tool.Context {
  return {
    sessionID: input.sessionID,
    messageID: input.messageID,
    agent: input.agent,
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

export function requireTool(tools: RuntimeTool[], id: string): RuntimeTool {
  const tool = tools.find((entry) => entry.id === id)
  if (tool) {
    return tool
  }

  const available = tools.map((entry) => entry.id).sort().join(", ")
  throw new Error(`Tool "${id}" was not registered. Available tools: ${available}`)
}
