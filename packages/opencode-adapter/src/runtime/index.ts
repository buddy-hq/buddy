import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import {
  OPENCODE_VERSION,
  startOpenCodeHost,
  type OpenCodeEnvironmentOptions,
  type OpenCodeHost,
  type OpenCodeUpgradeOptions,
} from "../host"
import { withBuddyCommandDisplay } from "../extension/command-display"
import { createChatGPTPlugin } from "../extension/chatgpt"
import { createRuntimeExtensionPlugin } from "../extension/plugin"
import { createApprovals } from "./approvals"
import { createCatalog } from "./catalog"
import { createChatGPT } from "./chatgpt"
import { createConversations } from "./conversations"
import { createEvents } from "./events"
import { createExecution } from "./execution"
import { createForms } from "./forms"
import { createMcp } from "./mcp"
import type { OpenCodeRuntimeOptions } from "./options"
import { createProviders } from "./providers"
import { createReferences } from "./references"
import { createWorkspace } from "./workspace"

export type { OpenCodeRuntimeOptions } from "./options"

const hosts = new WeakMap<AgentRuntime, OpenCodeHost>()

export function openCodeHostForRuntime(runtime: AgentRuntime): OpenCodeHost {
  const host = hosts.get(runtime)
  if (!host) throw new Error("The runtime was not created by the OpenCode adapter")
  return host
}

export async function startOpenCodeRuntime(
  options: OpenCodeRuntimeOptions & {
    readonly environment: OpenCodeEnvironmentOptions
    readonly extension: RuntimeExtension
    readonly initializeStorage: () => Promise<void>
    readonly hostConfig: () => Promise<{ readonly file: string }>
    readonly upgrade?: OpenCodeUpgradeOptions
  },
): Promise<{ readonly runtime: AgentRuntime; readonly close: () => Promise<void> }> {
  const hostPromise: Promise<OpenCodeHost> = startOpenCodeHost({
    environment: options.environment,
    initializeStorage: options.initializeStorage,
    upgrade: options.upgrade,
    configure: async () => ({
      config: await options.hostConfig(),
      plugins: [
        createRuntimeExtensionPlugin(options.extension, () => hostPromise, "catalog"),
        createChatGPTPlugin(options.extension.chatgpt),
      ],
      instances: {
        key: () => "buddy.runtime.v1",
        configure: () => ({
          plugins: [createRuntimeExtensionPlugin(options.extension, () => hostPromise)],
        }),
      },
    }),
    decorate: withBuddyCommandDisplay,
  })
  const host = await hostPromise
  return { runtime: createOpenCodeRuntime(host, options), close: () => host.close() }
}

export function createOpenCodeRuntime(
  host: OpenCodeHost,
  options: OpenCodeRuntimeOptions = {},
): AgentRuntime {
  const runtime: AgentRuntime = {
    name: "opencode",
    version: OPENCODE_VERSION,
    conversations: createConversations(host, options),
    execution: createExecution(host, options),
    events: createEvents(host, options),
    approvals: createApprovals(host, options),
    forms: createForms(host, options),
    catalog: createCatalog(host, options),
    workspace: createWorkspace(host, options),
    providers: createProviders(host, options),
    mcp: createMcp(host, options),
    references: createReferences(host, options),
    chatgpt: createChatGPT(host, options),
  }
  hosts.set(runtime, host)
  return runtime
}
