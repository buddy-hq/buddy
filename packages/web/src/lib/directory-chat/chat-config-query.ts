import { queryOptions } from "@tanstack/react-query"
import {
  loadAgentCatalog,
  loadCommandCatalog,
  loadPersonaCatalog,
  loadProjectConfig,
  type AgentConfigOption,
  type PersonaConfigOption,
  type PromptCommandOption,
} from "@/state/chat-actions"
import { readCompactionAuto } from "@/state/project-config-readers"
import { resolveDefaultAgentName } from "./agent-catalog"
import { parseConfiguredModel } from "./chat-prompt-helpers"

const DIRECTORY_CHAT_QUERY_SCOPE = "directory-chat" as const
const COMPOSER_CONFIG_QUERY_KEY = "composer-config" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const DIRECTORY_CHAT_QUERY_STALE_TIME_MS = 0
const E2E_BACKEND_COMMAND_NAME = "e2e-backend-command" as const

export type ComposerConfig = {
  agentCatalog: AgentConfigOption[]
  defaultAgent?: string
  personaCatalog: PersonaConfigOption[]
  slashCommands: PromptCommandOption[]
  configuredModel: { providerID: string; modelID: string } | undefined
  autoCompactionEnabled: boolean
}

export const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
  agentCatalog: [],
  defaultAgent: undefined,
  personaCatalog: [],
  slashCommands: [],
  configuredModel: undefined,
  autoCompactionEnabled: true,
}

function resolveDirectoryQueryKey(directory: string) {
  const normalizedDirectory = directory.trim()
  return normalizedDirectory.length > 0 ? normalizedDirectory : GLOBAL_DIRECTORY_QUERY_KEY
}

export const directoryChatQueryKeys = {
  allComposerConfigs: () => [DIRECTORY_CHAT_QUERY_SCOPE, COMPOSER_CONFIG_QUERY_KEY] as const,
  composerConfig: (directory: string) =>
    [
      DIRECTORY_CHAT_QUERY_SCOPE,
      COMPOSER_CONFIG_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
}

function withE2EBackendCommand(commands: PromptCommandOption[]): PromptCommandOption[] {
  if (import.meta.env.VITE_BUDDY_E2E !== "1") return commands
  if (commands.some((command) => command.name === E2E_BACKEND_COMMAND_NAME)) {
    return commands
  }

  return [
    ...commands,
    {
      name: E2E_BACKEND_COMMAND_NAME,
      description: "Deterministic backend slash command for E2E",
      source: "command",
    },
  ]
}

async function loadComposerConfig(directory: string): Promise<ComposerConfig> {
  const [agents, personas, config, commands] = await Promise.all([
    loadAgentCatalog(directory).catch(() => []),
    loadPersonaCatalog(directory),
    loadProjectConfig(directory),
    loadCommandCatalog(directory),
  ])

  return {
    agentCatalog: agents,
    defaultAgent: resolveDefaultAgentName(agents, config.default_agent),
    personaCatalog: personas,
    slashCommands: withE2EBackendCommand(commands),
    configuredModel: parseConfiguredModel(config.model),
    autoCompactionEnabled: readCompactionAuto(config, true),
  }
}

export function composerConfigQueryOptions(directory: string) {
  return queryOptions({
    queryKey: directoryChatQueryKeys.composerConfig(directory),
    queryFn: () => loadComposerConfig(directory),
    staleTime: DIRECTORY_CHAT_QUERY_STALE_TIME_MS,
  })
}
