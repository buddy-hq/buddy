import { useEffect, useState } from "react"
import {
  loadAgentCatalog,
  loadCommandCatalog,
  loadMcpStatus,
  loadPersonaCatalog,
  loadProjectConfig,
  resolveDefaultPersonaID,
} from "@/state/chat-actions"
import type {
  AgentConfigOption,
  PersonaConfigOption,
  PromptCommandOption,
} from "@/state/chat-actions"
import type { TeachingIntent } from "@/state/teaching-runtime"
import { resolveDefaultAgentName } from "./agent-catalog"

type UseChatConfigProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
}

type ComposerConfig = {
  agentCatalog: AgentConfigOption[]
  defaultAgent?: string
  personaCatalog: PersonaConfigOption[]
  slashCommands: PromptCommandOption[]
  defaultPersona: string
  defaultIntent: TeachingIntent
  configuredModel: { providerID: string; modelID: string } | undefined
}

const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
  agentCatalog: [],
  defaultAgent: undefined,
  personaCatalog: [],
  slashCommands: [],
  defaultPersona: "buddy",
  defaultIntent: "auto",
  configuredModel: undefined,
}

const E2E_BACKEND_COMMAND_NAME = "e2e-backend-command"

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

function parseConfiguredModel(value: unknown): { providerID: string; modelID: string } | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator >= trimmed.length - 1) return undefined
  return { providerID: trimmed.slice(0, separator), modelID: trimmed.slice(separator + 1) }
}

async function loadComposerConfig(directory: string): Promise<ComposerConfig> {
  const [agents, personas, config, commands] = await Promise.all([
    loadAgentCatalog(directory).catch(() => []),
    loadPersonaCatalog(directory),
    loadProjectConfig(directory),
    loadCommandCatalog(directory),
  ])

  const defaultPersona =
    resolveDefaultPersonaID(
      personas,
      typeof config.default_persona === "string" ? config.default_persona : undefined,
    ) ?? "buddy"

  const defaultIntent: TeachingIntent =
    config.default_intent === "learn" ||
    config.default_intent === "practice" ||
    config.default_intent === "assess"
      ? config.default_intent
      : "auto"

  return {
    agentCatalog: agents,
    defaultAgent: resolveDefaultAgentName(agents, config.default_agent),
    personaCatalog: personas,
    slashCommands: withE2EBackendCommand(commands),
    defaultPersona,
    defaultIntent,
    configuredModel: parseConfiguredModel(config.model),
  }
}

export function useChatConfig(props: UseChatConfigProps) {
  const { decodedDirectory, hasRegisteredProject } = props

  const [composerConfig, setComposerConfig] = useState<ComposerConfig>(DEFAULT_COMPOSER_CONFIG)

  // Load full composer configuration when directory changes or becomes registered.
  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    let cancelled = false

    void loadComposerConfig(decodedDirectory)
      .then((config) => {
        if (cancelled) return
        setComposerConfig(config)
      })
      .catch(() => {
        if (cancelled) return
        setComposerConfig(DEFAULT_COMPOSER_CONFIG)
      })

    return () => {
      cancelled = true
    }
  }, [decodedDirectory, hasRegisteredProject])

  function refreshSlashCommands() {
    if (!decodedDirectory || !hasRegisteredProject) return
    void loadCommandCatalog(decodedDirectory)
      .then((commands) => {
        setComposerConfig((current) => ({
          ...current,
          slashCommands: withE2EBackendCommand(commands),
        }))
      })
      .catch(() => undefined)
  }

  function refreshMcpStatus() {
    if (!decodedDirectory || !hasRegisteredProject) return
    void loadMcpStatus(decodedDirectory).catch(() => undefined)
  }

  return {
    ...composerConfig,
    refreshSlashCommands,
    refreshMcpStatus,
  }
}
