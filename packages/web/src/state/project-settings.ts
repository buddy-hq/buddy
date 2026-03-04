import { useEffect, useMemo, useState } from "react"
import {
  loadModeCatalog,
  loadProjectConfig,
  loadProviderCatalog,
  patchProjectConfig,
  type ModeConfigOption,
} from "./chat-actions"
import type { ProviderCatalogState } from "./chat-types"

export type LogLevel = "debug" | "info" | "warn" | "error"

type ProjectSettingsDraft = {
  mode: string
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
  modeCatalog: ModeConfigOption[]
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}

const EMPTY_PROVIDER_CATALOG: ProviderCatalogState = {
  providers: [],
  default: {},
}

const EMPTY_DRAFT: ProjectSettingsDraft = {
  mode: "",
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
  modes: ModeConfigOption[]
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
  const selectableModes = input.modes.filter((mode) => !mode.hidden)
  const configuredDefaultMode = readString(input.config, "default_mode")

  return {
    mode:
      configuredDefaultMode && selectableModes.some((mode) => mode.id === configuredDefaultMode)
        ? configuredDefaultMode
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
    modeCatalog: [],
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
      const [config, providerCatalog, modes] = await Promise.all([
        loadProjectConfig(directory),
        loadProviderCatalog(directory),
        loadModeCatalog(directory),
      ])
      const selectableModes = modes.filter((mode) => !mode.hidden)

      setState({
        loading: false,
        saving: false,
        error: undefined,
        projectConfig: config,
        providerCatalog,
        modeCatalog: selectableModes,
        draft: buildDraft({
          config,
          providerCatalog,
          modes,
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
    const currentMode = readString(state.projectConfig, "default_mode")
    const currentModel = readString(state.projectConfig, "model")
    const currentLogLevel = readString(state.projectConfig, "logLevel")
    const nextMode = state.draft.mode.trim()

    if (nextMode && nextMode !== currentMode) {
      patch.default_mode = nextMode
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
      modes: state.modeCatalog,
      providers: connected,
      allProviders: state.providerCatalog.providers,
      providerModels,
    },
    selection: {
      mode: state.draft.mode,
      provider: state.draft.provider,
      model: state.draft.model,
      logLevel: state.draft.logLevel,
    },
    actions: {
      setMode(mode: string) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            mode,
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
