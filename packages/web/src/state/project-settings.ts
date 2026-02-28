import { useEffect, useMemo, useState } from "react"
import {
  loadAgentCatalog,
  loadProjectConfig,
  loadProviderCatalog,
  patchProjectConfig,
  type AgentConfigOption,
} from "./chat-actions"
import type { ProviderCatalogState } from "./chat-types"

export type LogLevel = "debug" | "info" | "warn" | "error"

type ProjectSettingsDraft = {
  agent: string
  provider: string
  model: string
  logLevel: LogLevel | ""
}

type ProjectSettingsState = {
  loading: boolean
  saving: boolean
  error?: string
  projectConfig: Record<string, unknown>
  providerCatalog: ProviderCatalogState
  agentCatalog: AgentConfigOption[]
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}

const EMPTY_PROVIDER_CATALOG: ProviderCatalogState = {
  providers: [],
  default: {},
}

const EMPTY_DRAFT: ProjectSettingsDraft = {
  agent: "",
  provider: "",
  model: "",
  logLevel: "",
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

function parseModel(model: string) {
  if (!model) {
    return {
      providerID: "",
      modelID: "",
    }
  }

  const split = model.indexOf("/")
  if (split <= 0 || split >= model.length - 1) {
    return {
      providerID: "",
      modelID: "",
    }
  }

  return {
    providerID: model.slice(0, split),
    modelID: model.slice(split + 1),
  }
}

function connectedProviders(catalog: ProviderCatalogState) {
  return catalog.providers.filter((provider) => provider.connected)
}

function buildDraft(input: {
  config: Record<string, unknown>
  providerCatalog: ProviderCatalogState
  agents: AgentConfigOption[]
}): ProjectSettingsDraft {
  const model = parseModel(readString(input.config, "model"))
  const connected = connectedProviders(input.providerCatalog)
  const configuredProvider = connected.find((provider) => provider.id === model.providerID)
  const initialProvider = configuredProvider?.id ?? connected[0]?.id ?? ""
  const availableModels = connected.find((provider) => provider.id === initialProvider)?.models ?? []
  const configuredModelIsAvailable =
    initialProvider === model.providerID && availableModels.some((entry) => entry.id === model.modelID)
  const initialModel = configuredModelIsAvailable
    ? model.modelID
    : input.providerCatalog.default[initialProvider] ?? availableModels[0]?.id ?? ""
  const logLevel = readString(input.config, "logLevel")
  const selectableAgents = input.agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
  const configuredDefaultAgent = readString(input.config, "default_agent")

  return {
    agent:
      configuredDefaultAgent && selectableAgents.some((agent) => agent.name === configuredDefaultAgent)
        ? configuredDefaultAgent
        : "",
    provider: initialProvider,
    model: initialModel,
    logLevel:
      logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "error" ? logLevel : "",
  }
}

function emptyState(): ProjectSettingsState {
  return {
    loading: false,
    saving: false,
    error: undefined,
    projectConfig: {},
    providerCatalog: EMPTY_PROVIDER_CATALOG,
    agentCatalog: [],
    draft: EMPTY_DRAFT,
    modelSelectionDirty: false,
  }
}

export function useProjectSettings(directory: string, open: boolean) {
  const [state, setState] = useState<ProjectSettingsState>(() => emptyState())

  const connected = useMemo(
    () => connectedProviders(state.providerCatalog),
    [state.providerCatalog],
  )

  const providerModels = useMemo(
    () => connected.find((provider) => provider.id === state.draft.provider)?.models ?? [],
    [connected, state.draft.provider],
  )

  async function reload() {
    setState((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }))

    try {
      const [config, providerCatalog, agents] = await Promise.all([
        loadProjectConfig(directory),
        loadProviderCatalog(directory),
        loadAgentCatalog(directory),
      ])
      const selectableAgents = agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)

      setState({
        loading: false,
        saving: false,
        error: undefined,
        projectConfig: config,
        providerCatalog,
        agentCatalog: selectableAgents,
        draft: buildDraft({
          config,
          providerCatalog,
          agents,
        }),
        modelSelectionDirty: false,
      })
      return true
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        saving: false,
        error: stringifyError(error),
      }))
      return false
    }
  }

  useEffect(() => {
    if (!open) return
    void reload()
  }, [directory, open])

  async function save() {
    const patch: Record<string, unknown> = {}
    const currentAgent = readString(state.projectConfig, "default_agent")
    const currentModel = readString(state.projectConfig, "model")
    const currentLogLevel = readString(state.projectConfig, "logLevel")
    const nextAgent = state.draft.agent.trim()

    if (nextAgent !== currentAgent) {
      patch.default_agent = nextAgent
    }

    if (state.modelSelectionDirty && state.draft.provider && state.draft.model) {
      const nextModel = `${state.draft.provider}/${state.draft.model}`
      if (nextModel !== currentModel) {
        patch.model = nextModel
      }
    }

    if (state.draft.logLevel !== currentLogLevel) {
      patch.logLevel = state.draft.logLevel
    }

    if (Object.keys(patch).length === 0) {
      return true
    }

    setState((current) => ({
      ...current,
      saving: true,
      error: undefined,
    }))

    try {
      const updated = await patchProjectConfig(directory, patch)
      setState((current) => ({
        ...current,
        saving: false,
        projectConfig: updated,
        modelSelectionDirty: false,
      }))
      return true
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: stringifyError(error),
      }))
      return false
    }
  }

  return {
    status: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      providerMessage: connected.length === 0 ? "Connect a provider to choose a model." : undefined,
    },
    options: {
      agents: state.agentCatalog,
      providers: connected,
      allProviders: state.providerCatalog.providers,
      providerModels,
    },
    selection: {
      agent: state.draft.agent,
      provider: state.draft.provider,
      model: state.draft.model,
      logLevel: state.draft.logLevel,
    },
    actions: {
      setAgent(agent: string) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            agent,
          },
        }))
      },
      setProvider(provider: string) {
        setState((current) => {
          const models = connectedProviders(current.providerCatalog).find((entry) => entry.id === provider)?.models ?? []
          const defaultModel = current.providerCatalog.default[provider] ?? models[0]?.id ?? ""
          return {
            ...current,
            draft: {
              ...current.draft,
              provider,
              model: defaultModel,
            },
            modelSelectionDirty: true,
          }
        })
      },
      setModel(model: string) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            model,
          },
          modelSelectionDirty: true,
        }))
      },
      setLogLevel(logLevel: LogLevel | "") {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            logLevel,
          },
        }))
      },
      async refresh() {
        await reload()
      },
      save,
    },
  }
}
