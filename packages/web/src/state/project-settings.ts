import { useEffect, useMemo, useState } from "react"
import {
  loadAgentCatalog,
  loadProjectConfig,
  loadProviderCatalog,
  patchProjectConfig,
  type AgentConfigOption,
} from "./chat-actions"
import type { ConfigProvidersResponse } from "./chat-types"

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
  providerCatalog: ConfigProvidersResponse
  agentCatalog: AgentConfigOption[]
  draft: ProjectSettingsDraft
}

const EMPTY_PROVIDER_CATALOG: ConfigProvidersResponse = {
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

function emptyState(): ProjectSettingsState {
  return {
    loading: false,
    saving: false,
    error: undefined,
    projectConfig: {},
    providerCatalog: EMPTY_PROVIDER_CATALOG,
    agentCatalog: [],
    draft: EMPTY_DRAFT,
  }
}

export function useProjectSettings(directory: string, open: boolean) {
  const [state, setState] = useState<ProjectSettingsState>(() => emptyState())

  const providerModels = useMemo(
    () => state.providerCatalog.providers.find((provider) => provider.id === state.draft.provider)?.models ?? [],
    [state.draft.provider, state.providerCatalog.providers],
  )

  useEffect(() => {
    if (!open) return

    let disposed = false
    setState((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }))

    Promise.all([loadProjectConfig(directory), loadProviderCatalog(directory), loadAgentCatalog(directory)])
      .then(([config, providerResult, agents]) => {
        if (disposed) return

        const model = parseModel(readString(config, "model"))
        const initialProvider = model.providerID || providerResult.providers[0]?.id || ""
        const providerDefault = providerResult.default[initialProvider]
        const availableModels =
          providerResult.providers.find((provider) => provider.id === initialProvider)?.models ?? []
        const initialModel = model.modelID || providerDefault || availableModels[0]?.id || ""
        const logLevel = readString(config, "logLevel")
        const selectableAgents = agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
        const configuredDefaultAgent = readString(config, "default_agent")

        setState({
          loading: false,
          saving: false,
          error: undefined,
          projectConfig: config,
          providerCatalog: providerResult,
          agentCatalog: selectableAgents,
          draft: {
            agent:
              configuredDefaultAgent && selectableAgents.some((agent) => agent.name === configuredDefaultAgent)
                ? configuredDefaultAgent
                : "",
            provider: initialProvider,
            model: initialModel,
            logLevel:
              logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "error"
                ? logLevel
                : "",
          },
        })
      })
      .catch((error) => {
        if (disposed) return
        setState((current) => ({
          ...current,
          loading: false,
          error: stringifyError(error),
        }))
      })

    return () => {
      disposed = true
    }
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

    if (state.draft.provider && state.draft.model) {
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
    },
    options: {
      agents: state.agentCatalog,
      providers: state.providerCatalog.providers,
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
          const models = current.providerCatalog.providers.find((entry) => entry.id === provider)?.models ?? []
          const defaultModel = current.providerCatalog.default[provider] ?? models[0]?.id ?? ""
          return {
            ...current,
            draft: {
              ...current.draft,
              provider,
              model: defaultModel,
            },
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
      save,
    },
  }
}
