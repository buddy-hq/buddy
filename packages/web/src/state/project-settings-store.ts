import { createStore, type StateCreator } from "zustand/vanilla"
import type { ProviderCatalogState } from "./chat-types"
import {
  readLearnerMemoryAutoExtract,
  readLearnerMemoryEnabled,
  readLearnerMemoryMasterEnabled,
  readLearnerMemoryNumber,
  readLearnerMemoryString,
  readString,
} from "./project-config-readers"
import type { ProjectSettingsBundle } from "./project-settings-query"

export type LogLevel = "debug" | "info" | "warn" | "error"

type ProjectModelDraft = {
  provider: string
  model: string
  logLevel: LogLevel | ""
}

type LearnerMemoryDraft = {
  learnerMemoryMasterEnabled: boolean
  learnerMemoryEnabled: boolean
  learnerMemoryAutoExtract: boolean
  learnerMemoryMinUserMessages: number
  learnerMemoryAttentionThreshold: number
  learnerMemoryMaxExtractionCallsPerSession: number
  learnerMemoryMaxExtractionCallsPerDay: number
  learnerMemoryDefaultContextLimit: number
  learnerMemoryExtractModel: string
  learnerMemoryConsolidationModel: string
  learnerMemoryMinStartupIdleMs: number
  learnerMemoryStartupConcurrency: number
  learnerMemoryMaxRawMemoriesForConsolidation: number
  learnerMemoryMaxUnusedStageOneDays: number
}

export type ProjectSettingsDraft = ProjectModelDraft & LearnerMemoryDraft

type ProjectSettingsPatch = Record<string, unknown>

export type ProjectSettingsNumberField = keyof Pick<
  ProjectSettingsDraft,
  | "learnerMemoryMinUserMessages"
  | "learnerMemoryAttentionThreshold"
  | "learnerMemoryMaxExtractionCallsPerSession"
  | "learnerMemoryMaxExtractionCallsPerDay"
  | "learnerMemoryDefaultContextLimit"
  | "learnerMemoryMinStartupIdleMs"
  | "learnerMemoryStartupConcurrency"
  | "learnerMemoryMaxRawMemoriesForConsolidation"
  | "learnerMemoryMaxUnusedStageOneDays"
>

export type ProjectSettingsModelField = keyof Pick<
  ProjectSettingsDraft,
  "learnerMemoryExtractModel" | "learnerMemoryConsolidationModel"
>

type LearnerMemoryNumberFieldDefinition = {
  draftKey: ProjectSettingsNumberField
  configKey: string
  defaultValue: number
}

type LearnerMemoryStringFieldDefinition = {
  draftKey: ProjectSettingsModelField
  configKey: string
}

type ProjectSettingsDraftSlice = {
  draft: ProjectSettingsDraft
  modelSelectionDirty: boolean
}

type ProjectSettingsLifecycleSlice = {
  saving: boolean
  error?: string
  initializedDirectory?: string
  initializeFromBundle: (directory: string, bundle: ProjectSettingsBundle) => void
  replaceFromBundle: (directory: string, bundle: ProjectSettingsBundle) => void
  startSaving: () => void
  finishSaving: (projectPatch?: ProjectSettingsPatch) => void
  failSaving: (errorMessage: string) => void
  setError: (error?: string) => void
}

type ProjectSettingsModelSlice = {
  setProvider: (provider: string, providerCatalog: ProviderCatalogState) => void
  setModel: (model: string) => void
  setLogLevel: (logLevel: LogLevel | "") => void
}

type ProjectSettingsLearnerMemorySlice = {
  setLearnerMemoryMasterEnabled: (learnerMemoryMasterEnabled: boolean) => void
  setLearnerMemoryEnabled: (learnerMemoryEnabled: boolean) => void
  setLearnerMemoryAutoExtract: (learnerMemoryAutoExtract: boolean) => void
  setLearnerMemoryNumber: (key: ProjectSettingsNumberField, value: number) => void
  setLearnerMemoryModel: (key: ProjectSettingsModelField, value: string) => void
}

type ProjectSettingsStoreState = ProjectSettingsDraftSlice &
  ProjectSettingsLifecycleSlice &
  ProjectSettingsModelSlice &
  ProjectSettingsLearnerMemorySlice

type ProjectSettingsSlice<T> = StateCreator<ProjectSettingsStoreState, [], [], T>

export const EMPTY_PROVIDER_CATALOG: ProviderCatalogState = {
  providers: [],
  default: {},
}

export const LEARNER_MEMORY_NUMBER_FIELDS = [
  {
    draftKey: "learnerMemoryMinUserMessages",
    configKey: "min_user_messages",
    defaultValue: 4,
  },
  {
    draftKey: "learnerMemoryAttentionThreshold",
    configKey: "attention_threshold",
    defaultValue: 6,
  },
  {
    draftKey: "learnerMemoryMaxExtractionCallsPerSession",
    configKey: "max_extraction_calls_per_session",
    defaultValue: 2,
  },
  {
    draftKey: "learnerMemoryMaxExtractionCallsPerDay",
    configKey: "max_extraction_calls_per_day",
    defaultValue: 20,
  },
  {
    draftKey: "learnerMemoryDefaultContextLimit",
    configKey: "default_context_memory_limit",
    defaultValue: 8,
  },
  {
    draftKey: "learnerMemoryMinStartupIdleMs",
    configKey: "min_startup_idle_ms",
    defaultValue: 21_600_000,
  },
  {
    draftKey: "learnerMemoryStartupConcurrency",
    configKey: "startup_concurrency",
    defaultValue: 8,
  },
  {
    draftKey: "learnerMemoryMaxRawMemoriesForConsolidation",
    configKey: "max_raw_memories_for_consolidation",
    defaultValue: 256,
  },
  {
    draftKey: "learnerMemoryMaxUnusedStageOneDays",
    configKey: "max_unused_stage_one_days",
    defaultValue: 30,
  },
] as const satisfies readonly LearnerMemoryNumberFieldDefinition[]

export const LEARNER_MEMORY_STRING_FIELDS = [
  {
    draftKey: "learnerMemoryExtractModel",
    configKey: "extract_model",
  },
  {
    draftKey: "learnerMemoryConsolidationModel",
    configKey: "consolidation_model",
  },
] as const satisfies readonly LearnerMemoryStringFieldDefinition[]

export const LEARNER_MEMORY_GLOBAL_KEYS = [
  "master_enabled",
  ...LEARNER_MEMORY_NUMBER_FIELDS.map((field) => field.configKey),
  ...LEARNER_MEMORY_STRING_FIELDS.map((field) => field.configKey),
]

const EMPTY_PROJECT_MODEL_DRAFT: ProjectModelDraft = {
  provider: "",
  model: "",
  logLevel: "",
}
const EMPTY_LEARNER_MEMORY_DRAFT: LearnerMemoryDraft = {
  learnerMemoryMasterEnabled: false,
  learnerMemoryEnabled: false,
  learnerMemoryAutoExtract: false,
  learnerMemoryMinUserMessages: 4,
  learnerMemoryAttentionThreshold: 6,
  learnerMemoryMaxExtractionCallsPerSession: 2,
  learnerMemoryMaxExtractionCallsPerDay: 20,
  learnerMemoryDefaultContextLimit: 8,
  learnerMemoryExtractModel: "",
  learnerMemoryConsolidationModel: "",
  learnerMemoryMinStartupIdleMs: 21_600_000,
  learnerMemoryStartupConcurrency: 8,
  learnerMemoryMaxRawMemoriesForConsolidation: 256,
  learnerMemoryMaxUnusedStageOneDays: 30,
}
const EMPTY_DRAFT: ProjectSettingsDraft = {
  ...EMPTY_PROJECT_MODEL_DRAFT,
  ...EMPTY_LEARNER_MEMORY_DRAFT,
}

function isLogLevel(value: string): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error"
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

export function connectedProviders(catalog: ProviderCatalogState) {
  return catalog.providers.filter((provider) => provider.connected)
}

export function buildProjectSettingsDraft(input: {
  config: Record<string, unknown>
  globalConfig: Record<string, unknown>
  providerCatalog: ProviderCatalogState
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
  const logLevel = readString(input.globalConfig, "logLevel")
  const draft: ProjectSettingsDraft = {
    ...EMPTY_DRAFT,
    provider: initialProvider,
    model: initialModel,
    logLevel: isLogLevel(logLevel) ? logLevel : "",
    learnerMemoryMasterEnabled: readLearnerMemoryMasterEnabled(input.globalConfig, false),
    learnerMemoryEnabled: readLearnerMemoryEnabled(input.config, false),
    learnerMemoryAutoExtract: readLearnerMemoryAutoExtract(input.config, false),
  }

  for (const field of LEARNER_MEMORY_NUMBER_FIELDS) {
    draft[field.draftKey] = readLearnerMemoryNumber(
      input.globalConfig,
      field.configKey,
      field.defaultValue,
    )
  }

  for (const field of LEARNER_MEMORY_STRING_FIELDS) {
    draft[field.draftKey] = readLearnerMemoryString(input.globalConfig, field.configKey)
  }

  return draft
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

export function resolveLearnerMemoryMasterToggleDraft(
  draft: ProjectSettingsDraft,
  learnerMemoryMasterEnabled: boolean,
): ProjectSettingsDraft {
  return {
    ...draft,
    learnerMemoryMasterEnabled,
    learnerMemoryEnabled: learnerMemoryMasterEnabled ? draft.learnerMemoryEnabled : false,
    learnerMemoryAutoExtract: learnerMemoryMasterEnabled ? draft.learnerMemoryAutoExtract : false,
  }
}

const createProjectSettingsDraftSlice: ProjectSettingsSlice<ProjectSettingsDraftSlice> = () => ({
  draft: { ...EMPTY_DRAFT },
  modelSelectionDirty: false,
})

const createProjectSettingsLifecycleSlice: ProjectSettingsSlice<ProjectSettingsLifecycleSlice> = (
  set,
  get,
) => ({
  saving: false,
  error: undefined,
  initializedDirectory: undefined,
  initializeFromBundle(directory, bundle) {
    if (get().initializedDirectory === directory) {
      return
    }

    set({
      saving: false,
      error: undefined,
      draft: buildProjectSettingsDraft({
        config: bundle.projectConfig,
        globalConfig: bundle.globalConfig,
        providerCatalog: bundle.providerCatalog,
      }),
      modelSelectionDirty: false,
      initializedDirectory: directory,
    })
  },
  replaceFromBundle(directory, bundle) {
    set({
      saving: false,
      error: undefined,
      draft: buildProjectSettingsDraft({
        config: bundle.projectConfig,
        globalConfig: bundle.globalConfig,
        providerCatalog: bundle.providerCatalog,
      }),
      modelSelectionDirty: false,
      initializedDirectory: directory,
    })
  },
  startSaving() {
    set({
      saving: true,
      error: undefined,
    })
  },
  finishSaving(projectPatch) {
    const current = get()
    set({
      saving: false,
      modelSelectionDirty: resolveModelSelectionDirtyAfterPersist({
        draft: current.draft,
        modelSelectionDirty: current.modelSelectionDirty,
        patch: projectPatch,
      }),
    })
  },
  failSaving(errorMessage) {
    set({
      saving: false,
      error: errorMessage,
    })
  },
  setError(error) {
    set({ error })
  },
})

const createProjectSettingsModelSlice: ProjectSettingsSlice<ProjectSettingsModelSlice> = (set) => ({
  setProvider(provider, providerCatalog) {
    set((current) => {
      const models =
        connectedProviders(providerCatalog).find((entry) => entry.id === provider)?.models ?? []
      const defaultModel = providerCatalog.default[provider] ?? models[0]?.id ?? ""
      return {
        draft: {
          ...current.draft,
          provider,
          model: defaultModel,
        },
        modelSelectionDirty: true,
      }
    })
  },
  setModel(model) {
    set((current) => ({
      draft: {
        ...current.draft,
        model,
      },
      modelSelectionDirty: true,
    }))
  },
  setLogLevel(logLevel) {
    set((current) => ({
      draft: {
        ...current.draft,
        logLevel,
      },
    }))
  },
})

const createProjectSettingsLearnerMemorySlice: ProjectSettingsSlice<
  ProjectSettingsLearnerMemorySlice
> = (set) => ({
  setLearnerMemoryMasterEnabled(learnerMemoryMasterEnabled) {
    set((current) => ({
      draft: resolveLearnerMemoryMasterToggleDraft(current.draft, learnerMemoryMasterEnabled),
    }))
  },
  setLearnerMemoryEnabled(learnerMemoryEnabled) {
    set((current) => ({
      draft: {
        ...current.draft,
        learnerMemoryEnabled,
        learnerMemoryAutoExtract: learnerMemoryEnabled
          ? current.draft.learnerMemoryAutoExtract
          : false,
      },
    }))
  },
  setLearnerMemoryAutoExtract(learnerMemoryAutoExtract) {
    set((current) => ({
      draft: {
        ...current.draft,
        learnerMemoryMasterEnabled: learnerMemoryAutoExtract
          ? true
          : current.draft.learnerMemoryMasterEnabled,
        learnerMemoryEnabled: learnerMemoryAutoExtract ? true : current.draft.learnerMemoryEnabled,
        learnerMemoryAutoExtract,
      },
    }))
  },
  setLearnerMemoryNumber(key, value) {
    set((current) => ({
      draft: {
        ...current.draft,
        [key]: value,
      },
    }))
  },
  setLearnerMemoryModel(key, value) {
    set((current) => ({
      draft: {
        ...current.draft,
        [key]: value,
      },
    }))
  },
})

export function createProjectSettingsStore() {
  return createStore<ProjectSettingsStoreState>()((...args) => ({
    ...createProjectSettingsDraftSlice(...args),
    ...createProjectSettingsLifecycleSlice(...args),
    ...createProjectSettingsModelSlice(...args),
    ...createProjectSettingsLearnerMemorySlice(...args),
  }))
}

export type ProjectSettingsStore = ReturnType<typeof createProjectSettingsStore>
