import { useEffect, useState } from "react"
import {
  loadCommandCatalog,
  loadMcpStatus,
  loadPersonaCatalog,
  loadProjectConfig,
  resolveDefaultPersonaID,
} from "@/state/chat-actions"
import type { PersonaConfigOption, PromptCommandOption } from "@/state/chat-actions"
import type { TeachingIntent } from "@/state/teaching-runtime"

type UseChatConfigProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
}

type ComposerConfig = {
  personaCatalog: PersonaConfigOption[]
  slashCommands: PromptCommandOption[]
  defaultPersona: string
  defaultIntent: TeachingIntent
  configuredModel: { providerID: string; modelID: string } | undefined
}

const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
  personaCatalog: [],
  slashCommands: [],
  defaultPersona: "buddy",
  defaultIntent: "auto",
  configuredModel: undefined,
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
  const [personas, config, commands] = await Promise.all([
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
    config.default_intent === "learn" || config.default_intent === "practice" || config.default_intent === "assess"
      ? config.default_intent
      : "auto"

  return {
    personaCatalog: personas,
    slashCommands: commands,
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
        setComposerConfig((current) => ({ ...current, slashCommands: commands }))
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
