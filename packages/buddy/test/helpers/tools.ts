import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import type { Tool } from "@buddy/opencode-adapter/tool"

type ToolList = Awaited<ReturnType<typeof ToolRegistry.tools>>
type RuntimeTool = ToolList[number]

export const TEST_TOOL_MODEL = {
  providerID: ProviderID.opencode,
  modelID: ModelID.make("claude-sonnet"),
}

type ToolContextInput = {
  sessionID?: string
  messageID?: string
  agent: string
}

export function createToolContext(input: ToolContextInput): Tool.Context {
  return {
    sessionID: input.sessionID ? SessionID.make(input.sessionID) : SessionID.descending(),
    messageID: input.messageID ? MessageID.make(input.messageID) : MessageID.ascending(),
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

  const available = tools
    .map((entry) => entry.id)
    .toSorted()
    .join(", ")
  throw new Error(`Tool "${id}" was not registered. Available tools: ${available}`)
}
