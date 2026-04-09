import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  loadPersonaCatalog,
  loadProjectConfig,
  loadProviderCatalog,
  patchProjectConfig,
  type PersonaConfigOption,
} from "./chat-actions"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import type { TeachingIntent } from "./teaching-runtime"
import type { ProviderCatalogState } from "./chat-types"

export type LogLevel = "debug" | "info" | "warn" | "error"

type ProjectSettingsDraft = {
  persona: string
  intent: TeachingIntent
  provider: string
  model: string
  logLevel: LogLevel | ""
  fullTextReadingEnabled: boolean
}

type ProjectSettingsState = {
  loading: boolean
  saving: boolean
  error?: string
  projectConfig: Record<string, unknown>
  providerCatalog: ProviderCatalogState
  personaCatalog: PersonaConfigOption[]
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}

type ProjectSettingsPatch = Record<string, unknown>

const EMPTY_PROVIDER_CATALOG: ProviderCatalogState = {
  providers: [],
  default: {},
}

const EMPTY_DRAFT: ProjectSettingsDraft = {
  persona: "",
  intent: "auto",
  provider: "",
  model: "",
  logLevel: "",
  fullTextReadingEnabled: true,
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

function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function readToolToggle(input: Record<string, unknown>, toolId: string, fallback: boolean) {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : fallback
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
  personas: PersonaConfigOption[]
}): ProjectSettingsDraft {
  const model = parseModel(readString(input.config, "model"))
  const connected = connectedProviders(input.providerCatalog)
  const configuredProvider = connected.find((provider) => provider.id === model.providerID)
  const initialProvider = configuredProvider?.id ?? connected[0]?.id ?? ""
  const availableModels =
    connected.find((provider) => provider.id === initialProvider)?.models ?? []
  const configuredModelIsAvailable =
    initialProvider === model.providerID &&
    availableModels.some((entry) => entry.id === model.modelID)
  const initialModel = configuredModelIsAvailable
    ? model.modelID
    : (input.providerCatalog.default[initialProvider] ?? availableModels[0]?.id ?? "")
  const logLevel = readString(input.config, "logLevel")
  const selectablePersonas = input.personas.filter((persona) => !persona.hidden)
  const configuredDefaultPersona = readString(input.config, "default_persona")
  const configuredDefaultIntent = readString(input.config, "default_intent")

  return {
    persona:
      configuredDefaultPersona &&
      selectablePersonas.some((persona) => persona.id === configuredDefaultPersona)
        ? configuredDefaultPersona
        : "",
    intent:
      configuredDefaultIntent === "learn" ||
      configuredDefaultIntent === "practice" ||
      configuredDefaultIntent === "assess"
        ? configuredDefaultIntent
        : "auto",
    provider: initialProvider,
    model: initialModel,
    logLevel:
      logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "error"
        ? logLevel
        : "",
    fullTextReadingEnabled: readToolToggle(
      input.config,
      "pedagogy_resource_ingest_full_text",
      true,
    ),
  }
}

function buildProjectSettingsPatch(input: {
  projectConfig: Record<string, unknown>
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}): ProjectSettingsPatch | undefined {
  const patch: ProjectSettingsPatch = {}
  const currentPersona = readString(input.projectConfig, "default_persona")
  const currentIntent = readString(input.projectConfig, "default_intent")
  const currentModel = readString(input.projectConfig, "model")
  const currentLogLevel = readString(input.projectConfig, "logLevel")
  const currentFullTextReadingEnabled = readToolToggle(
    input.projectConfig,
    "pedagogy_resource_ingest_full_text",
    true,
  )
  const nextPersona = input.draft.persona.trim()

  if (nextPersona && nextPersona !== currentPersona) {
    patch.default_persona = nextPersona
  }

  const nextIntent = input.draft.intent === "auto" ? "" : input.draft.intent
  if (nextIntent !== currentIntent) {
    patch.default_intent = nextIntent || null
  }

  const shouldPersistModel =
    input.draft.provider.length > 0 &&
    input.draft.model.length > 0 &&
    (input.modelSelectionDirty || currentModel.length === 0)

  if (shouldPersistModel) {
    const nextModel = `${input.draft.provider}/${input.draft.model}`
    if (nextModel !== currentModel) {
      patch.model = nextModel
    }
  }

  if (input.draft.logLevel !== currentLogLevel) {
    patch.logLevel = input.draft.logLevel
  }

  if (input.draft.fullTextReadingEnabled !== currentFullTextReadingEnabled) {
    patch.tools = {
      pedagogy_resource_ingest_full_text: input.draft.fullTextReadingEnabled,
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

function modelSelectionKeyFromDraft(draft: ProjectSettingsDraft) {
  if (!draft.provider || !draft.model) {
    return ""
  }

  return `${draft.provider}/${draft.model}`
}

export function resolveModelSelectionDirtyAfterPersist(input: {
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
  patch?: ProjectSettingsPatch
}) {
  if (!input.modelSelectionDirty) {
    return false
  }

  const savedModel = typeof input.patch?.model === "string" ? input.patch.model : undefined
  if (!savedModel) {
    return input.modelSelectionDirty
  }

  return modelSelectionKeyFromDraft(input.draft) !== savedModel
}

function emptyState(): ProjectSettingsState {
  return {
    loading: false,
    saving: false,
    error: undefined,
    projectConfig: {},
    providerCatalog: EMPTY_PROVIDER_CATALOG,
    personaCatalog: [],
    draft: EMPTY_DRAFT,
    modelSelectionDirty: false,
  }
}

export function useProjectSettings(directory: string, open: boolean) {
  const [state, setState] = useState<ProjectSettingsState>(() => emptyState())
  const latestPersistRef = useRef<{
    directory: string
    open: boolean
    loading: boolean
    saving: boolean
    patch?: ProjectSettingsPatch
  }>({
    directory,
    open,
    loading: false,
    saving: false,
  })

  const connected = useMemo(
    () => connectedProviders(state.providerCatalog),
    [state.providerCatalog],
  )

  const providerModels = useMemo(
    () => connected.find((provider) => provider.id === state.draft.provider)?.models ?? [],
    [connected, state.draft.provider],
  )

  const reload = useCallback(async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }))

    try {
      const [config, providerCatalog, personas] = await Promise.all([
        loadProjectConfig(directory),
        loadProviderCatalog(directory),
        loadPersonaCatalog(directory),
      ])
      const selectablePersonas = personas.filter((persona) => !persona.hidden)

      setState({
        loading: false,
        saving: false,
        error: undefined,
        projectConfig: config,
        providerCatalog,
        personaCatalog: selectablePersonas,
        draft: buildDraft({
          config,
          providerCatalog,
          personas,
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
  }, [directory])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  const save = useCallback(async () => {
    const patch = buildProjectSettingsPatch({
      projectConfig: state.projectConfig,
      draft: state.draft,
      modelSelectionDirty: state.modelSelectionDirty,
    })

    if (!patch) {
      return true
    }

    setState((current) => ({
      ...current,
      saving: true,
      error: undefined,
    }))

    try {
      const updated = await patchProjectConfig(directory, patch)
      if (state.modelSelectionDirty && typeof patch.model === "string") {
        useChatStore.getState().setSelectedModel(directory, "auto")
      }
      setState((current) => ({
        ...current,
        saving: false,
        projectConfig: updated,
        modelSelectionDirty: resolveModelSelectionDirtyAfterPersist({
          draft: current.draft,
          modelSelectionDirty: current.modelSelectionDirty,
          patch,
        }),
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
  }, [directory, state.draft, state.modelSelectionDirty, state.projectConfig])

  useEffect(() => {
    if (!open || state.loading || state.saving) {
      return
    }

    const patch = buildProjectSettingsPatch({
      projectConfig: state.projectConfig,
      draft: state.draft,
      modelSelectionDirty: state.modelSelectionDirty,
    })
    if (!patch) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, 250)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    open,
    save,
    state.draft,
    state.loading,
    state.modelSelectionDirty,
    state.projectConfig,
    state.saving,
  ])

  useEffect(() => {
    latestPersistRef.current = {
      directory,
      open,
      loading: state.loading,
      saving: state.saving,
      patch: buildProjectSettingsPatch({
        projectConfig: state.projectConfig,
        draft: state.draft,
        modelSelectionDirty: state.modelSelectionDirty,
      }),
    }
  }, [
    directory,
    open,
    state.draft,
    state.loading,
    state.modelSelectionDirty,
    state.projectConfig,
    state.saving,
  ])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (!latest.open || latest.loading || latest.saving || !latest.patch) return
      void patchProjectConfig(latest.directory, latest.patch).catch(() => undefined)
    }
  }, [directory, open])

  return {
    status: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      providerMessage:
        connected.length === 0 ? language.t("projectSettings.connectProviderForModel") : undefined,
    },
    options: {
      personas: state.personaCatalog,
      providers: connected,
      allProviders: state.providerCatalog.providers,
      providerModels,
    },
    selection: {
      persona: state.draft.persona,
      intent: state.draft.intent,
      provider: state.draft.provider,
      model: state.draft.model,
      logLevel: state.draft.logLevel,
      fullTextReadingEnabled: state.draft.fullTextReadingEnabled,
    },
    actions: {
      setPersona(persona: string) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            persona,
          },
        }))
      },
      setIntent(intent: TeachingIntent) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            intent,
          },
        }))
      },
      setProvider(provider: string) {
        setState((current) => {
          const models =
            connectedProviders(current.providerCatalog).find((entry) => entry.id === provider)
              ?.models ?? []
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
      setFullTextReadingEnabled(fullTextReadingEnabled: boolean) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            fullTextReadingEnabled,
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
