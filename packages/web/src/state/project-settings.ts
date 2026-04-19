import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { patchProjectConfig, type PersonaConfigOption } from "./chat-actions"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import type { TeachingIntent } from "./teaching-runtime"
import type { ProviderCatalogState } from "./chat-types"
import { readCompactionAuto, readString, readToolToggle } from "./project-config-readers"
import { projectSettingsQueryOptions, type ProjectSettingsBundle } from "./project-settings-query"

export type LogLevel = "debug" | "info" | "warn" | "error"

type ProjectSettingsDraft = {
  persona: string
  intent: TeachingIntent
  provider: string
  model: string
  logLevel: LogLevel | ""
  fullTextReadingEnabled: boolean
  autoCompactionEnabled: boolean
}

type ProjectSettingsState = {
  saving: boolean
  error?: string
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
  initializedDirectory?: string
}

type ProjectSettingsPatch = Record<string, unknown>

const EMPTY_PROVIDER_CATALOG: ProviderCatalogState = {
  providers: [],
  default: {},
}
const EMPTY_PROJECT_CONFIG: Record<string, unknown> = {}

const EMPTY_DRAFT: ProjectSettingsDraft = {
  persona: "",
  intent: "auto",
  provider: "",
  model: "",
  logLevel: "",
  fullTextReadingEnabled: true,
  autoCompactionEnabled: true,
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
    autoCompactionEnabled: readCompactionAuto(input.config, true),
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
  const currentAutoCompactionEnabled = readCompactionAuto(input.projectConfig, true)
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

  if (input.draft.autoCompactionEnabled !== currentAutoCompactionEnabled) {
    patch.compaction = {
      auto: input.draft.autoCompactionEnabled,
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
    saving: false,
    error: undefined,
    draft: EMPTY_DRAFT,
    modelSelectionDirty: false,
    initializedDirectory: undefined,
  }
}

export function useProjectSettings(directory: string, open: boolean) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<ProjectSettingsState>(() => emptyState())
  const queryEnabled = open && directory.length > 0
  const settingsQuery = useQuery({
    ...projectSettingsQueryOptions(directory),
    enabled: queryEnabled,
  })
  const latestPersistRef = useRef<{
    directory: string
    open: boolean
    loading: boolean
    saving: boolean
    patch?: ProjectSettingsPatch
  }>({
    directory,
    open,
    loading: queryEnabled,
    saving: false,
  })
  const bundle = settingsQuery.data
  const activeBundle = state.initializedDirectory === directory ? bundle : undefined
  const providerCatalog = activeBundle?.providerCatalog ?? EMPTY_PROVIDER_CATALOG
  const personaCatalog = activeBundle?.personaCatalog ?? []
  const projectConfig = activeBundle?.projectConfig ?? EMPTY_PROJECT_CONFIG
  const loading =
    queryEnabled &&
    (settingsQuery.isPending ||
      (state.initializedDirectory !== directory && settingsQuery.isFetching))
  const error =
    state.error ?? (settingsQuery.error ? stringifyError(settingsQuery.error) : undefined)

  const connected = useMemo(() => connectedProviders(providerCatalog), [providerCatalog])

  const providerModels = useMemo(
    () => connected.find((provider) => provider.id === state.draft.provider)?.models ?? [],
    [connected, state.draft.provider],
  )

  useEffect(() => {
    if (!bundle) return

    setState((current) => {
      if (current.initializedDirectory === directory) {
        return current
      }

      return {
        saving: false,
        error: undefined,
        draft: buildDraft({
          config: bundle.projectConfig,
          providerCatalog: bundle.providerCatalog,
          personas: bundle.personaCatalog,
        }),
        modelSelectionDirty: false,
        initializedDirectory: directory,
      }
    })
  }, [bundle, directory])

  const save = useCallback(async () => {
    if (!activeBundle) {
      return false
    }

    const patch = buildProjectSettingsPatch({
      projectConfig: activeBundle.projectConfig,
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
      queryClient.setQueryData<ProjectSettingsBundle>(
        projectSettingsQueryOptions(directory).queryKey,
        {
          projectConfig: updated,
          providerCatalog: activeBundle.providerCatalog,
          personaCatalog: activeBundle.personaCatalog,
        },
      )
      setState((current) => ({
        ...current,
        saving: false,
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
  }, [activeBundle, directory, queryClient, state.draft, state.modelSelectionDirty])

  useEffect(() => {
    if (!open || loading || state.saving || !activeBundle) {
      return
    }

    const patch = buildProjectSettingsPatch({
      projectConfig: activeBundle.projectConfig,
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
  }, [open, save, state.draft, loading, state.modelSelectionDirty, state.saving, activeBundle])

  useEffect(() => {
    latestPersistRef.current = {
      directory,
      open,
      loading,
      saving: state.saving,
      patch: buildProjectSettingsPatch({
        projectConfig,
        draft: state.draft,
        modelSelectionDirty: state.modelSelectionDirty,
      }),
    }
  }, [
    directory,
    open,
    state.draft,
    loading,
    state.modelSelectionDirty,
    projectConfig,
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
      loading,
      saving: state.saving,
      error,
      providerMessage:
        connected.length === 0 ? language.t("projectSettings.connectProviderForModel") : undefined,
    },
    options: {
      personas: personaCatalog,
      providers: connected,
      allProviders: providerCatalog.providers,
      providerModels,
    },
    selection: {
      persona: state.draft.persona,
      intent: state.draft.intent,
      provider: state.draft.provider,
      model: state.draft.model,
      logLevel: state.draft.logLevel,
      fullTextReadingEnabled: state.draft.fullTextReadingEnabled,
      autoCompactionEnabled: state.draft.autoCompactionEnabled,
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
            connectedProviders(providerCatalog).find((entry) => entry.id === provider)?.models ?? []
          const defaultModel = providerCatalog.default[provider] ?? models[0]?.id ?? ""
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
      setAutoCompactionEnabled(autoCompactionEnabled: boolean) {
        setState((current) => ({
          ...current,
          draft: {
            ...current.draft,
            autoCompactionEnabled,
          },
        }))
      },
      async refresh() {
        try {
          await queryClient.invalidateQueries({
            queryKey: projectSettingsQueryOptions(directory).queryKey,
          })
          const nextBundle = await queryClient.fetchQuery(projectSettingsQueryOptions(directory))
          setState({
            saving: false,
            error: undefined,
            draft: buildDraft({
              config: nextBundle.projectConfig,
              providerCatalog: nextBundle.providerCatalog,
              personas: nextBundle.personaCatalog,
            }),
            modelSelectionDirty: false,
            initializedDirectory: directory,
          })
          return true
        } catch (error) {
          setState((current) => ({
            ...current,
            error: stringifyError(error),
          }))
          return false
        }
      },
      save,
    },
  }
}
