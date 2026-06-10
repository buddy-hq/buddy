import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { patchGlobalConfig, patchProjectConfig } from "./chat-actions"
import { useChatStore } from "./chat-store"
import {
  FULL_TEXT_TOOL_ID,
  createGeneralSettingsStore,
  type GeneralSettingsDraft,
} from "./general-settings-store"
import { generalSettingsQueryOptions, type GeneralSettingsBundle } from "./general-settings-query"
import { readCompactionAuto, readToolToggle } from "./project-config-readers"
import { directoryChatQueryKeys } from "@/lib/directory-chat/chat-config-query"
import {
  createAutosavePayloadKey,
  retainFailedAutosaveKey,
  shouldSkipFailedAutosave,
  type AutosaveAttemptOptions,
} from "./settings-autosave"

type GeneralSettingsPatch = Record<string, unknown>
type GeneralSettingsPatches = {
  globalPatch?: GeneralSettingsPatch
}

const AUTO_SAVE_DELAY_MS = 250
const GENERAL_OVERRIDE_CLEANUP_PATCH: Record<string, unknown> = {
  tools: {
    [FULL_TEXT_TOOL_ID]: null,
  },
  compaction: {
    auto: null,
  },
}
const CLEANUP_FAILURE_MESSAGE =
  "Saved global settings, but could not clear some notebook overrides."

function normalizeDirectories(directories: string[]) {
  return Array.from(
    new Set(
      directories.map((directory) => directory.trim()).filter((directory) => directory.length > 0),
    ),
  )
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

function buildGeneralSettingsPatch(input: {
  globalConfig: Record<string, unknown>
  draft: GeneralSettingsDraft
}): GeneralSettingsPatches | undefined {
  const globalPatch: GeneralSettingsPatch = {}
  const currentFullTextReadingEnabled = readToolToggle(input.globalConfig, FULL_TEXT_TOOL_ID, true)
  const currentAutoCompactionEnabled = readCompactionAuto(input.globalConfig, true)

  if (input.draft.fullTextReadingEnabled !== currentFullTextReadingEnabled) {
    globalPatch.tools = {
      [FULL_TEXT_TOOL_ID]: input.draft.fullTextReadingEnabled,
    }
  }

  if (input.draft.autoCompactionEnabled !== currentAutoCompactionEnabled) {
    globalPatch.compaction = {
      auto: input.draft.autoCompactionEnabled,
    }
  }

  return Object.keys(globalPatch).length > 0 ? { globalPatch } : undefined
}

export function useGeneralSettings(input: { cleanupDirectories: string[] }) {
  const queryClient = useQueryClient()
  const [store] = useState(createGeneralSettingsStore)
  const {
    draft,
    error: storeError,
    initialized,
    saving,
  } = useStore(
    store,
    useShallow((state) => ({
      draft: state.draft,
      error: state.error,
      initialized: state.initialized,
      saving: state.saving,
    })),
  )
  const GLOBAL_KEY = ""
  const cleanupDirectories = useMemo(
    () => normalizeDirectories(input.cleanupDirectories),
    [input.cleanupDirectories],
  )
  const settingsQuery = useQuery(generalSettingsQueryOptions())
  const latestPersistRef = useRef<{
    loading: boolean
    saving: boolean
    cleanupDirectories: string[]
    patches?: GeneralSettingsPatches
    patchKey?: string
    failedPatchKey?: string
  }>({
    loading: true,
    saving: false,
    cleanupDirectories,
  })
  const failedPatchKeyRef = useRef<string | undefined>(undefined)
  const bundle = settingsQuery.data
  const activeBundle = initialized === GLOBAL_KEY ? bundle : undefined
  const loading =
    settingsQuery.isPending || (initialized !== GLOBAL_KEY && settingsQuery.isFetching)
  const error =
    storeError ?? (settingsQuery.error ? stringifyError(settingsQuery.error) : undefined)

  useEffect(() => {
    if (!bundle) {
      return
    }

    store.getState().initializeFromBundle(GLOBAL_KEY, bundle)
  }, [bundle, store])

  const save = useCallback(
    async (options?: AutosaveAttemptOptions) => {
      if (!activeBundle) {
        return false
      }

      const current = store.getState()
      const patches = buildGeneralSettingsPatch({
        globalConfig: activeBundle.globalConfig,
        draft: current.draft,
      })

      if (!patches?.globalPatch) {
        failedPatchKeyRef.current = undefined
        return true
      }
      const patchKey = createAutosavePayloadKey(patches.globalPatch)
      if (
        shouldSkipFailedAutosave({
          key: patchKey,
          failedKey: failedPatchKeyRef.current,
          force: options?.force,
        })
      ) {
        return false
      }

      store.getState().startSaving()

      try {
        const updatedGlobal = await patchGlobalConfig(patches.globalPatch)
        const cleanupResults = await Promise.all(
          cleanupDirectories.map((directory) =>
            patchProjectConfig(directory, GENERAL_OVERRIDE_CLEANUP_PATCH)
              .then(() => undefined)
              .catch(() => directory),
          ),
        )
        const cleanupFailures = cleanupResults.filter(
          (directory): directory is string => directory !== undefined,
        )

        queryClient.setQueryData<GeneralSettingsBundle>(generalSettingsQueryOptions().queryKey, {
          globalConfig: updatedGlobal,
        })

        await Promise.all(
          useChatStore.getState().openProjects.map((openDirectory) =>
            queryClient.invalidateQueries({
              queryKey: directoryChatQueryKeys.composerConfig(openDirectory),
            }),
          ),
        )

        store
          .getState()
          .finishSaving(cleanupFailures.length > 0 ? CLEANUP_FAILURE_MESSAGE : undefined)
        failedPatchKeyRef.current = undefined
        return cleanupFailures.length === 0
      } catch (error) {
        failedPatchKeyRef.current = patchKey
        store.getState().failSaving(stringifyError(error))
        return false
      }
    },
    [activeBundle, cleanupDirectories, queryClient, store],
  )

  useEffect(() => {
    if (loading || saving || !activeBundle) {
      return
    }

    const patches = buildGeneralSettingsPatch({
      globalConfig: activeBundle.globalConfig,
      draft,
    })
    const patchKey = createAutosavePayloadKey(patches?.globalPatch)
    failedPatchKeyRef.current = retainFailedAutosaveKey({
      key: patchKey,
      failedKey: failedPatchKeyRef.current,
    })
    if (!patches?.globalPatch) {
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
  }, [activeBundle, draft, loading, save, saving])

  useEffect(() => {
    latestPersistRef.current = {
      loading,
      saving,
      cleanupDirectories,
      patches: activeBundle
        ? buildGeneralSettingsPatch({
            globalConfig: activeBundle.globalConfig,
            draft,
          })
        : undefined,
      patchKey: activeBundle
        ? createAutosavePayloadKey(
            buildGeneralSettingsPatch({
              globalConfig: activeBundle.globalConfig,
              draft,
            })?.globalPatch,
          )
        : undefined,
      failedPatchKey: failedPatchKeyRef.current,
    }
  }, [activeBundle, cleanupDirectories, draft, loading, saving])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (
        latest.loading ||
        latest.saving ||
        !latest.patches?.globalPatch ||
        shouldSkipFailedAutosave({
          key: latest.patchKey,
          failedKey: latest.failedPatchKey,
        })
      ) {
        return
      }

      void patchGlobalConfig(latest.patches.globalPatch).catch(() => undefined)
      void Promise.all(
        latest.cleanupDirectories.map((directory) =>
          patchProjectConfig(directory, GENERAL_OVERRIDE_CLEANUP_PATCH).catch(() => undefined),
        ),
      ).catch(() => undefined)
    }
  }, [])

  return {
    status: {
      loading,
      saving,
      error,
      hasPendingChanges: Boolean(
        activeBundle &&
        buildGeneralSettingsPatch({
          globalConfig: activeBundle.globalConfig,
          draft,
        })?.globalPatch,
      ),
    },
    selection: {
      fullTextReadingEnabled: draft.fullTextReadingEnabled,
      autoCompactionEnabled: draft.autoCompactionEnabled,
    },
    actions: {
      setFullTextReadingEnabled(fullTextReadingEnabled: boolean) {
        store.getState().setFullTextReadingEnabled(fullTextReadingEnabled)
      },
      setAutoCompactionEnabled(autoCompactionEnabled: boolean) {
        store.getState().setAutoCompactionEnabled(autoCompactionEnabled)
      },
      save() {
        return save({ force: true })
      },
    },
  }
}
