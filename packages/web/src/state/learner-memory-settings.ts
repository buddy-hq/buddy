import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { getConnectedProviders } from "@/lib/provider-catalog"
import { patchGlobalConfig } from "./chat-actions"
import { providerCatalogSnapshotQueryOptions } from "./bootstrap-query"
import { globalConfigQueryOptions, setGlobalConfigQueryData } from "./global-config-query"
import {
  createAutosavePayloadKey,
  retainFailedAutosaveKey,
  shouldSkipFailedAutosave,
  type AutosaveAttemptOptions,
} from "./settings-autosave"
import {
  readLearnerMemoryAutoExtract,
  readLearnerMemoryEnabled,
  readLearnerMemoryNumber,
  readLearnerMemoryString,
  readRecord,
} from "./project-config-readers"
import { EMPTY_BUDDY_CONFIG, parseBooleanValue, stringifyCaughtError } from "./parse-external"

const AUTO_SAVE_DELAY_MS = 250

type TLearnerMemoryFieldValue = boolean | number | string | null
type TLearnerMemoryFieldPatch = {
  enabled?: boolean
  auto_extract?: boolean
  [key: string]: TLearnerMemoryFieldValue | undefined
}
type TLearnerMemoryConfigPatch = {
  learner_memory: TLearnerMemoryFieldPatch
}

type PersistSnapshot = {
  loading: boolean
  saving: boolean
  patch?: TLearnerMemoryConfigPatch
  patchKey?: string
  failedPatchKey?: string
}

export type LearnerMemoryGlobalNumberField = keyof Pick<
  LearnerMemoryGlobalSettingsDraft,
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

export type LearnerMemoryGlobalModelField = keyof Pick<
  LearnerMemoryGlobalSettingsDraft,
  "learnerMemoryExtractModel" | "learnerMemoryConsolidationModel"
>

type LearnerMemoryNumberFieldDefinition = {
  draftKey: LearnerMemoryGlobalNumberField
  configKey: string
  defaultValue: number
}

type LearnerMemoryStringFieldDefinition = {
  draftKey: LearnerMemoryGlobalModelField
  configKey: string
}

export type LearnerMemoryGlobalSettingsDraft = {
  learnerMemoryDefaultEnabled: boolean
  learnerMemoryDefaultAutoExtract: boolean
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

const EMPTY_GLOBAL_DRAFT: LearnerMemoryGlobalSettingsDraft = {
  learnerMemoryDefaultEnabled: false,
  learnerMemoryDefaultAutoExtract: false,
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

export function buildGlobalLearnerMemoryDraft<TConfig>(
  globalConfig: TConfig,
): LearnerMemoryGlobalSettingsDraft {
  const draft: LearnerMemoryGlobalSettingsDraft = {
    ...EMPTY_GLOBAL_DRAFT,
    learnerMemoryDefaultEnabled: readLearnerMemoryEnabled(globalConfig, false),
    learnerMemoryDefaultAutoExtract: readLearnerMemoryAutoExtract(globalConfig, false),
  }

  for (const field of LEARNER_MEMORY_NUMBER_FIELDS) {
    draft[field.draftKey] = readLearnerMemoryNumber(
      globalConfig,
      field.configKey,
      field.defaultValue,
    )
  }

  for (const field of LEARNER_MEMORY_STRING_FIELDS) {
    draft[field.draftKey] = readLearnerMemoryString(globalConfig, field.configKey)
  }

  return draft
}

export function buildGlobalLearnerMemoryPatch<TConfig>(
  globalConfig: TConfig,
  draft: LearnerMemoryGlobalSettingsDraft,
) {
  const learnerMemoryPatch: TLearnerMemoryFieldPatch = {}

  if (draft.learnerMemoryDefaultEnabled !== readLearnerMemoryEnabled(globalConfig, false)) {
    learnerMemoryPatch.enabled = draft.learnerMemoryDefaultEnabled
  }

  const nextDefaultAutoExtract = draft.learnerMemoryDefaultEnabled
    ? draft.learnerMemoryDefaultAutoExtract
    : false
  if (nextDefaultAutoExtract !== readLearnerMemoryAutoExtract(globalConfig, false)) {
    learnerMemoryPatch.auto_extract = nextDefaultAutoExtract
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

  return Object.keys(learnerMemoryPatch).length > 0
    ? { learner_memory: learnerMemoryPatch }
    : undefined
}

function readNotebookLearnerMemoryOverride<TConfig>(
  rawProjectConfig: TConfig,
  key: "enabled" | "auto_extract",
) {
  const learnerMemory = readRecord(rawProjectConfig, "learner_memory")
  return parseBooleanValue(learnerMemory?.[key])
}

export function resolveNotebookLearnerMemorySelection<TConfig>(
  globalConfig: TConfig,
  rawProjectConfig: TConfig,
) {
  const defaultEnabled = readLearnerMemoryEnabled(globalConfig, false)
  const defaultAutoExtract = readLearnerMemoryAutoExtract(globalConfig, false)
  const enabledOverride = readNotebookLearnerMemoryOverride(rawProjectConfig, "enabled")
  const autoExtractOverride = readNotebookLearnerMemoryOverride(rawProjectConfig, "auto_extract")
  const enabled = enabledOverride ?? defaultEnabled
  const autoExtractWhenEnabled = autoExtractOverride ?? defaultAutoExtract
  const autoExtract = enabled ? autoExtractWhenEnabled : false

  return {
    defaultEnabled,
    defaultAutoExtract,
    enabled,
    autoExtract,
    autoExtractWhenEnabled,
    enabledUsesGlobalDefault: enabledOverride === undefined,
    autoExtractUsesGlobalDefault: autoExtractOverride === undefined,
  }
}

export async function loadNotebookLearnerMemoryDefaults(queryClient: QueryClient) {
  const globalConfig = await queryClient.ensureQueryData(globalConfigQueryOptions())
  return resolveNotebookLearnerMemorySelection(globalConfig, {})
}

export function buildNotebookLearnerMemoryPatch<TConfig>(input: {
  globalConfig: TConfig
  rawProjectConfig: TConfig
  enabled: boolean
  autoExtract: boolean
}) {
  const currentEnabledOverride = readNotebookLearnerMemoryOverride(
    input.rawProjectConfig,
    "enabled",
  )
  const currentAutoExtractOverride = readNotebookLearnerMemoryOverride(
    input.rawProjectConfig,
    "auto_extract",
  )
  const defaultEnabled = readLearnerMemoryEnabled(input.globalConfig, false)
  const defaultAutoExtract = readLearnerMemoryAutoExtract(input.globalConfig, false)
  const nextEnabledOverride = input.enabled === defaultEnabled ? undefined : input.enabled
  const nextAutoExtractOverride = input.enabled
    ? input.autoExtract === defaultAutoExtract
      ? undefined
      : input.autoExtract
    : undefined

  if (
    currentEnabledOverride === nextEnabledOverride &&
    currentAutoExtractOverride === nextAutoExtractOverride
  ) {
    return undefined
  }

  const learnerMemoryPatch: Record<string, boolean | null> = {}

  if (currentEnabledOverride !== nextEnabledOverride) {
    learnerMemoryPatch.enabled = nextEnabledOverride ?? null
  }

  if (currentAutoExtractOverride !== nextAutoExtractOverride) {
    learnerMemoryPatch.auto_extract = nextAutoExtractOverride ?? null
  }

  return Object.keys(learnerMemoryPatch).length > 0
    ? { learner_memory: learnerMemoryPatch }
    : undefined
}

export function useGlobalLearnerMemorySettings() {
  const queryClient = useQueryClient()
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const providerCatalogQuery = useQuery(providerCatalogSnapshotQueryOptions())
  const [draft, setDraft] = useState<LearnerMemoryGlobalSettingsDraft>(EMPTY_GLOBAL_DRAFT)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const globalConfig = globalConfigQuery.data ?? EMPTY_BUDDY_CONFIG
  const patch = useMemo(
    () => buildGlobalLearnerMemoryPatch(globalConfig, draft),
    [draft, globalConfig],
  )
  const patchKey = useMemo(() => createAutosavePayloadKey(patch), [patch])
  const failedPatchKeyRef = useRef<string | undefined>(undefined)
  const latestPersistRef = useRef<PersistSnapshot>({
    loading: true,
    saving: false,
  })

  useEffect(() => {
    if (!globalConfigQuery.data) {
      return
    }

    if (!initialized) {
      setDraft(buildGlobalLearnerMemoryDraft(globalConfigQuery.data))
      setInitialized(true)
      return
    }

    if (saving || patch) {
      return
    }

    setDraft(buildGlobalLearnerMemoryDraft(globalConfigQuery.data))
  }, [globalConfigQuery.data, initialized, patch, saving])

  const save = useCallback(
    async (options?: AutosaveAttemptOptions) => {
      if (!patch) {
        failedPatchKeyRef.current = undefined
        return true
      }
      if (
        shouldSkipFailedAutosave({
          key: patchKey,
          failedKey: failedPatchKeyRef.current,
          force: options?.force,
        })
      ) {
        return false
      }

      setSaving(true)
      setError(undefined)

      try {
        const updatedGlobal = await patchGlobalConfig(patch)
        setGlobalConfigQueryData(queryClient, updatedGlobal)
        failedPatchKeyRef.current = undefined
        setSaving(false)
        return true
      } catch (nextError) {
        failedPatchKeyRef.current = patchKey
        setError(stringifyCaughtError(nextError))
        setSaving(false)
        return false
      }
    },
    [patch, patchKey, queryClient],
  )

  useEffect(() => {
    if (!initialized || !globalConfigQuery.data || saving) {
      return
    }
    failedPatchKeyRef.current = retainFailedAutosaveKey({
      key: patchKey,
      failedKey: failedPatchKeyRef.current,
    })
    if (!patch) {
      return
    }
    if (
      shouldSkipFailedAutosave({
        key: patchKey,
        failedKey: failedPatchKeyRef.current,
      })
    ) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [globalConfigQuery.data, initialized, patch, patchKey, save, saving])

  useEffect(() => {
    latestPersistRef.current = {
      loading: globalConfigQuery.isPending,
      saving,
      patch,
      patchKey,
      failedPatchKey: failedPatchKeyRef.current,
    }
  }, [globalConfigQuery.isPending, patch, patchKey, saving])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (
        latest.loading ||
        latest.saving ||
        !latest.patch ||
        shouldSkipFailedAutosave({
          key: latest.patchKey,
          failedKey: latest.failedPatchKey,
        })
      ) {
        return
      }

      void patchGlobalConfig(latest.patch).catch(() => undefined)
    }
  }, [])

  const connectedProviders = useMemo(
    () => getConnectedProviders(providerCatalogQuery.data?.providers ?? []),
    [providerCatalogQuery.data?.providers],
  )

  return {
    status: {
      loading: globalConfigQuery.isPending || providerCatalogQuery.isPending || !initialized,
      saving,
      error:
        error ??
        (globalConfigQuery.error
          ? stringifyCaughtError(globalConfigQuery.error)
          : providerCatalogQuery.error
            ? stringifyCaughtError(providerCatalogQuery.error)
            : undefined),
      hasPendingChanges: Boolean(patch),
    },
    selection: draft,
    options: {
      providers: connectedProviders,
    },
    actions: {
      setLearnerMemoryDefaultEnabled(learnerMemoryDefaultEnabled: boolean) {
        setDraft((current) => ({
          ...current,
          learnerMemoryDefaultEnabled,
          learnerMemoryDefaultAutoExtract: learnerMemoryDefaultEnabled
            ? current.learnerMemoryDefaultAutoExtract
            : false,
        }))
      },
      setLearnerMemoryDefaultAutoExtract(learnerMemoryDefaultAutoExtract: boolean) {
        setDraft((current) => ({
          ...current,
          learnerMemoryDefaultEnabled: learnerMemoryDefaultAutoExtract
            ? true
            : current.learnerMemoryDefaultEnabled,
          learnerMemoryDefaultAutoExtract,
        }))
      },
      setLearnerMemoryNumber(key: LearnerMemoryGlobalNumberField, value: number) {
        setDraft((current) => ({
          ...current,
          [key]: value,
        }))
      },
      setLearnerMemoryModel(key: LearnerMemoryGlobalModelField, value: string) {
        setDraft((current) => ({
          ...current,
          [key]: value,
        }))
      },
      refresh() {
        return globalConfigQuery.refetch()
      },
      save() {
        return save({ force: true })
      },
    },
  }
}
