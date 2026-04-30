import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { patchGlobalConfig, patchProjectConfig } from "./chat-actions"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import {
  EMPTY_PROVIDER_CATALOG,
  LEARNER_MEMORY_GLOBAL_KEYS,
  LEARNER_MEMORY_NUMBER_FIELDS,
  LEARNER_MEMORY_STRING_FIELDS,
  connectedProviders,
  createProjectSettingsStore,
  resolveLearnerMemoryMasterToggleDraft,
  resolveModelSelectionDirtyAfterPersist,
  type LogLevel,
  type ProjectSettingsDraft,
  type ProjectSettingsModelField,
  type ProjectSettingsNumberField,
} from "./project-settings-store"
import {
  readLearnerMemoryAutoExtract,
  readLearnerMemoryEnabled,
  readLearnerMemoryMasterEnabled,
  readLearnerMemoryNumber,
  readLearnerMemoryString,
  readRecord,
  readString,
} from "./project-config-readers"
import { projectSettingsQueryOptions, type ProjectSettingsBundle } from "./project-settings-query"

export { resolveLearnerMemoryMasterToggleDraft, resolveModelSelectionDirtyAfterPersist }
export type { LogLevel } from "./project-settings-store"

type ProjectSettingsPatch = Record<string, unknown>
type ProjectSettingsPatches = {
  projectPatch?: ProjectSettingsPatch
  globalPatch?: ProjectSettingsPatch
}

const EMPTY_PROJECT_CONFIG: Record<string, unknown> = {}
const DEPRECATED_LEARNER_MEMORY_SESSION_KEY = "max_session_messages"
const AUTO_SAVE_DELAY_MS = 250

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function mergePatchForCache(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key]
      continue
    }

    const currentRecord = readRecord(next, key)
    if (currentRecord && isUnknownRecord(value)) {
      next[key] = mergePatchForCache(currentRecord, value)
      continue
    }

    next[key] = value
  }
  return next
}

function buildProjectLearnerMemoryPatch(draft: ProjectSettingsDraft) {
  const learnerMemoryPatch: ProjectSettingsPatch = {
    enabled: draft.learnerMemoryEnabled,
    auto_extract: draft.learnerMemoryEnabled ? draft.learnerMemoryAutoExtract : false,
    [DEPRECATED_LEARNER_MEMORY_SESSION_KEY]: null,
  }

  for (const key of LEARNER_MEMORY_GLOBAL_KEYS) {
    learnerMemoryPatch[key] = null
  }

  return learnerMemoryPatch
}

function buildGlobalLearnerMemoryPatch(
  globalConfig: Record<string, unknown>,
  draft: ProjectSettingsDraft,
): ProjectSettingsPatch | undefined {
  const learnerMemoryPatch: ProjectSettingsPatch = {}

  if (draft.learnerMemoryMasterEnabled !== readLearnerMemoryMasterEnabled(globalConfig, false)) {
    learnerMemoryPatch.master_enabled = draft.learnerMemoryMasterEnabled
  }

  for (const field of LEARNER_MEMORY_NUMBER_FIELDS) {
    const currentValue = readLearnerMemoryNumber(globalConfig, field.configKey, field.defaultValue)
    if (draft[field.draftKey] !== currentValue) {
      learnerMemoryPatch[field.configKey] = draft[field.draftKey]
    }
  }

  for (const field of LEARNER_MEMORY_STRING_FIELDS) {
    const currentValue = readLearnerMemoryString(globalConfig, field.configKey)
    if (draft[field.draftKey] !== currentValue) {
      learnerMemoryPatch[field.configKey] = draft[field.draftKey] || null
    }
  }

  return Object.keys(learnerMemoryPatch).length > 0 ? learnerMemoryPatch : undefined
}

function buildProjectSettingsPatch(input: {
  projectConfig: Record<string, unknown>
  rawProjectConfig: Record<string, unknown>
  globalConfig: Record<string, unknown>
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}): ProjectSettingsPatches | undefined {
  const projectPatch: ProjectSettingsPatch = {}
  const globalPatch: ProjectSettingsPatch = {}
  const currentModel = readString(input.projectConfig, "model")
  const currentLogLevel = readString(input.globalConfig, "logLevel")
  const currentLearnerMemoryEnabled = readLearnerMemoryEnabled(input.projectConfig, false)
  const currentLearnerMemoryAutoExtract = readLearnerMemoryAutoExtract(input.projectConfig, false)
  const currentLearnerMemory = readRecord(input.rawProjectConfig, "learner_memory")
  const hasDeprecatedLearnerMemoryMaxSessionMessages =
    currentLearnerMemory !== undefined &&
    DEPRECATED_LEARNER_MEMORY_SESSION_KEY in currentLearnerMemory
  const hasProjectLearnerMemoryGlobalOverrides =
    currentLearnerMemory !== undefined &&
    LEARNER_MEMORY_GLOBAL_KEYS.some((key) => key in currentLearnerMemory)
  const learnerMemoryChanged =
    hasDeprecatedLearnerMemoryMaxSessionMessages ||
    hasProjectLearnerMemoryGlobalOverrides ||
    input.draft.learnerMemoryEnabled !== currentLearnerMemoryEnabled ||
    input.draft.learnerMemoryAutoExtract !== currentLearnerMemoryAutoExtract

  const shouldPersistModel =
    input.draft.provider.length > 0 &&
    input.draft.model.length > 0 &&
    (input.modelSelectionDirty || currentModel.length === 0)

  if (shouldPersistModel) {
    const nextModel = `${input.draft.provider}/${input.draft.model}`
    if (nextModel !== currentModel) {
      projectPatch.model = nextModel
    }
  }

  if (input.draft.logLevel !== currentLogLevel) {
    globalPatch.logLevel = input.draft.logLevel
  }

  if (learnerMemoryChanged) {
    projectPatch.learner_memory = buildProjectLearnerMemoryPatch(input.draft)
  }

  const globalLearnerMemoryPatch = buildGlobalLearnerMemoryPatch(input.globalConfig, input.draft)
  if (globalLearnerMemoryPatch) {
    globalPatch.learner_memory = globalLearnerMemoryPatch
  }

  const nextProjectPatch = Object.keys(projectPatch).length > 0 ? projectPatch : undefined
  const nextGlobalPatch = Object.keys(globalPatch).length > 0 ? globalPatch : undefined
  return nextProjectPatch || nextGlobalPatch
    ? { projectPatch: nextProjectPatch, globalPatch: nextGlobalPatch }
    : undefined
}

export function useNotebookSettingsWorkbench(directory: string, open: boolean) {
  const queryClient = useQueryClient()
  const [store] = useState(createProjectSettingsStore)
  const {
    draft,
    error: storeError,
    initializedDirectory,
    modelSelectionDirty,
    saving,
  } = useStore(
    store,
    useShallow((state) => ({
      draft: state.draft,
      error: state.error,
      initializedDirectory: state.initializedDirectory,
      modelSelectionDirty: state.modelSelectionDirty,
      saving: state.saving,
    })),
  )
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
    patches?: ProjectSettingsPatches
  }>({
    directory,
    open,
    loading: queryEnabled,
    saving: false,
  })
  const bundle = settingsQuery.data
  const activeBundle = initializedDirectory === directory ? bundle : undefined
  const providerCatalog = activeBundle?.providerCatalog ?? EMPTY_PROVIDER_CATALOG
  const projectConfig = activeBundle?.projectConfig ?? EMPTY_PROJECT_CONFIG
  const rawProjectConfig = activeBundle?.rawProjectConfig ?? EMPTY_PROJECT_CONFIG
  const globalConfig = activeBundle?.globalConfig ?? EMPTY_PROJECT_CONFIG
  const loading =
    queryEnabled &&
    (settingsQuery.isPending || (initializedDirectory !== directory && settingsQuery.isFetching))
  const error =
    storeError ?? (settingsQuery.error ? stringifyError(settingsQuery.error) : undefined)

  const connected = useMemo(() => connectedProviders(providerCatalog), [providerCatalog])
  const providerModels = useMemo(
    () => connected.find((provider) => provider.id === draft.provider)?.models ?? [],
    [connected, draft.provider],
  )

  useEffect(() => {
    if (!bundle) {
      return
    }

    store.getState().initializeFromBundle(directory, bundle)
  }, [bundle, directory, store])

  const save = useCallback(async () => {
    if (!activeBundle) {
      return false
    }

    const current = store.getState()
    const patches = buildProjectSettingsPatch({
      projectConfig: activeBundle.projectConfig,
      rawProjectConfig: activeBundle.rawProjectConfig,
      globalConfig: activeBundle.globalConfig,
      draft: current.draft,
      modelSelectionDirty: current.modelSelectionDirty,
    })

    if (!patches) {
      return true
    }

    store.getState().startSaving()

    try {
      const [updatedGlobal, updatedProject] = await Promise.all([
        patches.globalPatch ? patchGlobalConfig(patches.globalPatch) : activeBundle.globalConfig,
        patches.projectPatch
          ? patchProjectConfig(directory, patches.projectPatch)
          : activeBundle.projectConfig,
      ])
      if (current.modelSelectionDirty && typeof patches.projectPatch?.model === "string") {
        useChatStore.getState().setSelectedModel(directory, "auto")
      }
      queryClient.setQueryData<ProjectSettingsBundle>(
        projectSettingsQueryOptions(directory).queryKey,
        {
          globalConfig: updatedGlobal,
          projectConfig: updatedProject,
          rawProjectConfig: patches.projectPatch
            ? mergePatchForCache(activeBundle.rawProjectConfig, patches.projectPatch)
            : activeBundle.rawProjectConfig,
          providerCatalog: activeBundle.providerCatalog,
        },
      )
      store.getState().finishSaving(patches.projectPatch)
      return true
    } catch (error) {
      store.getState().failSaving(stringifyError(error))
      return false
    }
  }, [activeBundle, directory, queryClient, store])

  useEffect(() => {
    if (!open || loading || saving || !activeBundle) {
      return
    }

    const patches = buildProjectSettingsPatch({
      projectConfig: activeBundle.projectConfig,
      rawProjectConfig: activeBundle.rawProjectConfig,
      globalConfig: activeBundle.globalConfig,
      draft,
      modelSelectionDirty,
    })
    if (!patches) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [activeBundle, draft, loading, modelSelectionDirty, open, save, saving])

  useEffect(() => {
    latestPersistRef.current = {
      directory,
      open,
      loading,
      saving,
      patches: buildProjectSettingsPatch({
        projectConfig,
        rawProjectConfig,
        globalConfig,
        draft,
        modelSelectionDirty,
      }),
    }
  }, [
    directory,
    draft,
    globalConfig,
    loading,
    modelSelectionDirty,
    open,
    projectConfig,
    rawProjectConfig,
    saving,
  ])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (!latest.open || latest.loading || latest.saving || !latest.patches) {
        return
      }
      if (latest.patches.globalPatch) {
        void patchGlobalConfig(latest.patches.globalPatch).catch(() => undefined)
      }
      if (latest.patches.projectPatch) {
        void patchProjectConfig(latest.directory, latest.patches.projectPatch).catch(
          () => undefined,
        )
      }
    }
  }, [])

  return {
    status: {
      loading,
      saving,
      error,
      providerMessage:
        connected.length === 0 ? language.t("projectSettings.connectProviderForModel") : undefined,
    },
    options: {
      providers: connected,
      allProviders: providerCatalog.providers,
      providerModels,
    },
    selection: {
      provider: draft.provider,
      model: draft.model,
      logLevel: draft.logLevel,
      learnerMemoryMasterEnabled: draft.learnerMemoryMasterEnabled,
      learnerMemoryEnabled: draft.learnerMemoryEnabled,
      learnerMemoryAutoExtract: draft.learnerMemoryAutoExtract,
      learnerMemoryMinUserMessages: draft.learnerMemoryMinUserMessages,
      learnerMemoryAttentionThreshold: draft.learnerMemoryAttentionThreshold,
      learnerMemoryMaxExtractionCallsPerSession: draft.learnerMemoryMaxExtractionCallsPerSession,
      learnerMemoryMaxExtractionCallsPerDay: draft.learnerMemoryMaxExtractionCallsPerDay,
      learnerMemoryDefaultContextLimit: draft.learnerMemoryDefaultContextLimit,
      learnerMemoryExtractModel: draft.learnerMemoryExtractModel,
      learnerMemoryConsolidationModel: draft.learnerMemoryConsolidationModel,
      learnerMemoryMinStartupIdleMs: draft.learnerMemoryMinStartupIdleMs,
      learnerMemoryStartupConcurrency: draft.learnerMemoryStartupConcurrency,
      learnerMemoryMaxRawMemoriesForConsolidation:
        draft.learnerMemoryMaxRawMemoriesForConsolidation,
      learnerMemoryMaxUnusedStageOneDays: draft.learnerMemoryMaxUnusedStageOneDays,
    },
    actions: {
      setProvider(provider: string) {
        store.getState().setProvider(provider, providerCatalog)
      },
      setModel(model: string) {
        store.getState().setModel(model)
      },
      setLogLevel(logLevel: LogLevel | "") {
        store.getState().setLogLevel(logLevel)
      },
      setLearnerMemoryMasterEnabled(learnerMemoryMasterEnabled: boolean) {
        store.getState().setLearnerMemoryMasterEnabled(learnerMemoryMasterEnabled)
      },
      setLearnerMemoryEnabled(learnerMemoryEnabled: boolean) {
        store.getState().setLearnerMemoryEnabled(learnerMemoryEnabled)
      },
      setLearnerMemoryAutoExtract(learnerMemoryAutoExtract: boolean) {
        store.getState().setLearnerMemoryAutoExtract(learnerMemoryAutoExtract)
      },
      setLearnerMemoryNumber(key: ProjectSettingsNumberField, value: number) {
        store.getState().setLearnerMemoryNumber(key, value)
      },
      setLearnerMemoryModel(key: ProjectSettingsModelField, value: string) {
        store.getState().setLearnerMemoryModel(key, value)
      },
      async refresh() {
        try {
          await queryClient.invalidateQueries({
            queryKey: projectSettingsQueryOptions(directory).queryKey,
          })
          const nextBundle = await queryClient.fetchQuery(projectSettingsQueryOptions(directory))
          store.getState().replaceFromBundle(directory, nextBundle)
          return true
        } catch (error) {
          store.getState().setError(stringifyError(error))
          return false
        }
      },
      save,
    },
  }
}
