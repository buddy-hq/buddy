import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { patchGlobalConfig, patchProjectConfig } from "./chat-actions"
import {
  setToolsSettingsBundleQueryData,
  toolsSettingsBundleQueryOptions,
  toolsSettingsQueryKeys,
  type ToolsSettingsBundle,
} from "./tools-settings-query"
import {
  STANDARDS_TOOL_IDS,
  TOOL_OVERRIDE_MODE,
  buildGlobalToolsPatch,
  buildGlobalToolsRollbackPatch,
  buildProjectToolsPatch,
  createToolsSettingsStore,
  resolveEffectiveToolSelection,
  writeGlobalToolsConfig,
  writeProjectToolsConfig,
  type GlobalToolsSettingsPatch,
  type ProjectToolsSettingsPatch,
  type StandardsToolId,
  type StandardsToolOverrideMode,
} from "./tools-settings-store"

export { STANDARDS_TOOL_IDS, TOOL_OVERRIDE_MODE }
export type { StandardsToolId, StandardsToolOverrideMode } from "./tools-settings-store"

type PersistSnapshot = {
  directory: string
  open: boolean
  loading: boolean
  saving: boolean
  globalPatch?: GlobalToolsSettingsPatch
  projectPatch?: ProjectToolsSettingsPatch
}

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

async function persistToolsSettings(input: {
  directory: string
  globalPatch?: GlobalToolsSettingsPatch
  projectPatch?: ProjectToolsSettingsPatch
}) {
  if (input.globalPatch) {
    await patchGlobalConfig(input.globalPatch)
  }

  if (input.projectPatch) {
    await patchProjectConfig(input.directory, input.projectPatch)
  }
}

export function useToolsSettings(directory: string, open: boolean) {
  const queryClient = useQueryClient()
  const [store] = useState(createToolsSettingsStore)
  const { error, globalDraft, initializedDirectory, projectDraft, saving } = useStore(
    store,
    useShallow((state) => ({
      error: state.error,
      globalDraft: state.globalDraft,
      initializedDirectory: state.initializedDirectory,
      projectDraft: state.projectDraft,
      saving: state.saving,
    })),
  )
  const queryEnabled = open && directory.length > 0
  const settingsQuery = useQuery({
    ...toolsSettingsBundleQueryOptions(directory),
    enabled: queryEnabled,
  })
  const activeBundle = initializedDirectory === directory ? settingsQuery.data : undefined
  const loading =
    queryEnabled &&
    (settingsQuery.isPending || (initializedDirectory !== directory && settingsQuery.isFetching))
  const latestPersistRef = useRef<PersistSnapshot>({
    directory,
    open: false,
    loading,
    saving: false,
  })

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    store.getState().initializeFromBundle(directory, settingsQuery.data)
  }, [directory, settingsQuery.data, store])

  useEffect(() => {
    if (!settingsQuery.error) {
      return
    }

    store.getState().failSaving(stringifyError(settingsQuery.error))
  }, [settingsQuery.error, store])

  const save = useCallback(async () => {
    if (!activeBundle) {
      return false
    }

    const current = store.getState()
    const globalPatch = buildGlobalToolsPatch(activeBundle.globalConfig, current.globalDraft)
    const projectPatch = buildProjectToolsPatch(activeBundle.rawProjectConfig, current.projectDraft)

    if (!globalPatch && !projectPatch) {
      return true
    }

    store.getState().startSaving()

    const nextGlobalConfig =
      globalPatch === undefined
        ? activeBundle.globalConfig
        : writeGlobalToolsConfig(activeBundle.globalConfig, current.globalDraft)
    const nextRawProjectConfig =
      projectPatch === undefined
        ? activeBundle.rawProjectConfig
        : writeProjectToolsConfig(activeBundle.rawProjectConfig, current.projectDraft)
    const nextBundle: ToolsSettingsBundle = {
      globalConfig: nextGlobalConfig,
      rawProjectConfig: nextRawProjectConfig,
    }

    try {
      if (globalPatch) {
        await patchGlobalConfig(globalPatch)
      }

      if (projectPatch) {
        await patchProjectConfig(directory, projectPatch)
      }

      setToolsSettingsBundleQueryData(queryClient, directory, nextBundle)
      store.getState().finishSaving(directory)
      return true
    } catch (error) {
      let rollbackError: unknown

      if (globalPatch && projectPatch) {
        const rollbackPatch = buildGlobalToolsRollbackPatch(
          nextGlobalConfig,
          activeBundle.globalConfig,
        )
        if (rollbackPatch) {
          try {
            await patchGlobalConfig(rollbackPatch)
          } catch (candidate) {
            rollbackError = candidate
          }
        }
      }

      const errorMessage = stringifyError(error)
      let refreshedBundle: ToolsSettingsBundle | undefined
      try {
        await queryClient.invalidateQueries({
          queryKey: toolsSettingsQueryKeys.bundle(directory),
        })
        refreshedBundle = await queryClient.fetchQuery(toolsSettingsBundleQueryOptions(directory))
      } catch {
        refreshedBundle = undefined
      }

      if (refreshedBundle) {
        store.getState().replaceFromBundle(directory, refreshedBundle)
        store
          .getState()
          .setError(
            rollbackError === undefined
              ? errorMessage
              : `${errorMessage}. Global defaults may have been saved while notebook overrides failed.`,
          )
      } else {
        store
          .getState()
          .failSaving(
            rollbackError === undefined
              ? errorMessage
              : `${errorMessage}. Global defaults may have been saved while notebook overrides failed.`,
          )
      }
      return false
    }
  }, [activeBundle, directory, queryClient, store])

  useEffect(() => {
    if (!open || loading || saving || !activeBundle) {
      return
    }

    const globalPatch = buildGlobalToolsPatch(activeBundle.globalConfig, globalDraft)
    const projectPatch = buildProjectToolsPatch(activeBundle.rawProjectConfig, projectDraft)
    if (!globalPatch && !projectPatch) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [activeBundle, globalDraft, loading, open, projectDraft, save, saving])

  useEffect(() => {
    latestPersistRef.current = {
      directory,
      open,
      loading,
      saving,
      globalPatch: activeBundle
        ? buildGlobalToolsPatch(activeBundle.globalConfig, globalDraft)
        : undefined,
      projectPatch: activeBundle
        ? buildProjectToolsPatch(activeBundle.rawProjectConfig, projectDraft)
        : undefined,
    }
  }, [activeBundle, directory, globalDraft, loading, open, projectDraft, saving])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (
        !latest.open ||
        latest.loading ||
        latest.saving ||
        (!latest.globalPatch && !latest.projectPatch)
      ) {
        return
      }

      void persistToolsSettings({
        directory: latest.directory,
        globalPatch: latest.globalPatch,
        projectPatch: latest.projectPatch,
      }).catch(() => undefined)
    }
  }, [])

  const globalPatch = activeBundle
    ? buildGlobalToolsPatch(activeBundle.globalConfig, globalDraft)
    : undefined
  const projectPatch = activeBundle
    ? buildProjectToolsPatch(activeBundle.rawProjectConfig, projectDraft)
    : undefined
  const effectiveSelection = resolveEffectiveToolSelection(globalDraft, projectDraft)

  return {
    status: {
      loading,
      saving,
      error,
      hasPendingChanges: Boolean(globalPatch || projectPatch),
    },
    selection: {
      globalDefaults: globalDraft,
      notebookOverrides: projectDraft,
      effective: effectiveSelection,
    },
    actions: {
      setGlobalToolEnabled(toolId: StandardsToolId, enabled: boolean) {
        store.getState().setGlobalToolEnabled(toolId, enabled)
      },
      setAllGlobalToolsEnabled(enabled: boolean) {
        store.getState().setAllGlobalToolsEnabled(enabled)
      },
      setProjectToolMode(toolId: StandardsToolId, mode: StandardsToolOverrideMode) {
        store.getState().setProjectToolMode(toolId, mode)
      },
      async refresh() {
        const result = await settingsQuery.refetch()
        if (!result.data) {
          return false
        }

        store.getState().replaceFromBundle(directory, result.data)
        return true
      },
      save,
    },
  }
}
