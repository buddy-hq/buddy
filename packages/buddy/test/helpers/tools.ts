import { Effect } from "effect"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import type { Tool } from "@buddy/opencode-adapter/tool"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { loadOpenCodeApp } from "../../src/opencode-runtime"

type ToolList = Awaited<ReturnType<typeof ToolRegistry.tools>>
type RuntimeTool = ToolList[number]

export const TEST_TOOL_MODEL = {
  providerID: ProviderID.opencode,
  modelID: ModelID.make("claude-sonnet"),
}

export async function ensureBuddyPluginTools(directory: string) {
  await loadOpenCodeApp()
  await syncOpenCodeProjectConfig(directory)
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
    metadata() {
      return Effect.void
    },
    ask() {
      return Effect.void
    },
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
