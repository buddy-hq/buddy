import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { Plugin, type PluginContext } from "@buddy/opencode-adapter/plugin"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { generateObjectID } from "../../src/objects"

export const TEST_TOOL_MODEL = { providerID: "opencode", modelID: "claude-sonnet" }

type BuddyToolContextInput = {
  directory: string
  sessionID?: string
  messageID?: string
  agent: string
}

export function createBuddyToolContext(input: BuddyToolContextInput): BuddyToolContext {
  return {
    directory: input.directory,
    sessionID: input.sessionID ?? `ses_${generateObjectID()}`,
    messageID: input.messageID ?? `msg_${generateObjectID()}`,
    agent: input.agent,
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    ask: async () => {},
  }
}

export const createToolContext = createBuddyToolContext

export async function listBuddyTools() {
  await import("../../src/opencode-runtime/client")
  const [{ allBuddyTools }, { getDynamicToolSearchTools }] = await Promise.all([
    import("../../src/learning/runtime/feature-registry"),
    import("../../src/learning/runtime/dynamic-tool-discovery"),
  ])
  return [...allBuddyTools(), ...getDynamicToolSearchTools()]
}

export function requireTool<T extends { id: string }>(tools: readonly T[], id: string): T {
  const tool = tools.find((entry) => entry.id === id)
  if (tool) return tool
  const available = tools.map((entry) => entry.id).toSorted().join(", ")
  throw new Error(`Tool "${id}" was not registered. Available tools: ${available}`)
}

export async function ensureBuddyPluginTools(directory: string, plugins: readonly Plugin.Plugin[] = []) {
  const [{ createBuddyRuntimePlugin }, { withBuddyToolPermissionReplies }, { syncNotebookRuntimeConfig }, { createNotebookTestHost }] = await Promise.all([
    import("../../src/opencode-runtime/plugins/buddy-runtime-plugin"),
    import("../../src/opencode-runtime/tool-permission"),
    import("../../src/config/runtime/opencode-sync"),
    import("./opencode"),
  ])
  let host: OpenCodeHost
  let context: PluginContext | undefined
  const runtime = await createNotebookTestHost({
    plugins: [
      createBuddyRuntimePlugin({ getClient: async () => host }),
      Plugin.define({
        id: "buddy.test.tool-catalog",
        setup(ctx) { context = ctx },
      }),
      ...plugins,
    ],
  })
  host = withBuddyToolPermissionReplies(runtime.host)
  try {
    await syncNotebookRuntimeConfig(host, directory)
    return {
      host,
      async listTools() {
        if (!context) throw new Error("Notebook tool plugin was not initialized")
        return context.tool.list()
      },
      [Symbol.asyncDispose]: () => runtime[Symbol.asyncDispose](),
    }
  } catch (cause) {
    await runtime[Symbol.asyncDispose]()
    throw cause
  }
}
