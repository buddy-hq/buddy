import { useCallback, useEffect, useRef, useState } from "react"
import { loadGlobalConfig, patchGlobalConfig } from "./chat-actions"

export const STANDARDS_TOOL_IDS = [
  "search_standards",
  "get_standard",
  "get_learning_components",
  "get_prerequisites",
  "get_next_standards",
  "get_crosswalk",
  "query_standards_sql",
] as const

export type StandardsToolId = (typeof STANDARDS_TOOL_IDS)[number]

type ToolsSettingsDraft = Record<StandardsToolId, boolean>

type ToolsSettingsState = {
  loading: boolean
  saving: boolean
  error?: string
  globalConfig: Record<string, unknown>
  draft: ToolsSettingsDraft
}

type ToolsSettingsPatch = {
  tools?: Record<string, boolean>
}

function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function readToolToggle(
  input: Record<string, unknown>,
  toolId: string,
  fallback: boolean,
): boolean {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : fallback
}

function buildDraft(config: Record<string, unknown>): ToolsSettingsDraft {
  return {
    search_standards: readToolToggle(config, "search_standards", true),
    get_standard: readToolToggle(config, "get_standard", true),
    get_learning_components: readToolToggle(config, "get_learning_components", true),
    get_prerequisites: readToolToggle(config, "get_prerequisites", true),
    get_next_standards: readToolToggle(config, "get_next_standards", true),
    get_crosswalk: readToolToggle(config, "get_crosswalk", true),
    query_standards_sql: readToolToggle(config, "query_standards_sql", true),
  }
}

function buildToolsSettingsPatch(
  globalConfig: Record<string, unknown>,
  draft: ToolsSettingsDraft,
): ToolsSettingsPatch | undefined {
  const toolsPatch: Record<string, boolean> = {}
  let hasChanges = false

  for (const toolId of STANDARDS_TOOL_IDS) {
    const currentValue = readToolToggle(globalConfig, toolId, true)
    if (draft[toolId] !== currentValue) {
      toolsPatch[toolId] = draft[toolId]
      hasChanges = true
    }
  }

  return hasChanges ? { tools: toolsPatch } : undefined
}

function emptyState(): ToolsSettingsState {
  return {
    loading: false,
    saving: false,
    error: undefined,
    globalConfig: {},
    draft: {
      search_standards: true,
      get_standard: true,
      get_learning_components: true,
      get_prerequisites: true,
      get_next_standards: true,
      get_crosswalk: true,
      query_standards_sql: true,
    },
  }
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

export function useToolsSettings(open: boolean) {
  const [state, setState] = useState<ToolsSettingsState>(() => emptyState())
  const latestPersistRef = useRef<{
    open: boolean
    loading: boolean
    saving: boolean
    patch?: ToolsSettingsPatch
  }>({
    open,
    loading: false,
    saving: false,
  })

  const reload = useCallback(async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }))

    try {
      const config = await loadGlobalConfig()

      setState({
        loading: false,
        saving: false,
        error: undefined,
        globalConfig: config,
        draft: buildDraft(config),
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
  }, [])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  const save = useCallback(async () => {
    const patch = buildToolsSettingsPatch(state.globalConfig, state.draft)

    if (!patch) {
      return true
    }

    setState((current) => ({
      ...current,
      saving: true,
      error: undefined,
    }))

    try {
      const updated = await patchGlobalConfig(patch)
      setState((current) => ({
        ...current,
        saving: false,
        globalConfig: updated,
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
  }, [state.draft, state.globalConfig])

  useEffect(() => {
    if (!open || state.loading || state.saving) {
      return
    }

    const patch = buildToolsSettingsPatch(state.globalConfig, state.draft)
    if (!patch) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, 250)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [open, save, state.draft, state.loading, state.globalConfig, state.saving])

  useEffect(() => {
    latestPersistRef.current = {
      open,
      loading: state.loading,
      saving: state.saving,
      patch: buildToolsSettingsPatch(state.globalConfig, state.draft),
    }
  }, [open, state.draft, state.loading, state.globalConfig, state.saving])

  useEffect(() => {
    return () => {
      const latest = latestPersistRef.current
      if (!latest.open || latest.loading || latest.saving || !latest.patch) return
      void patchGlobalConfig(latest.patch).catch(() => undefined)
    }
  }, [open])

  const setToolEnabled = useCallback((toolId: StandardsToolId, enabled: boolean) => {
    setState((current) => ({
      ...current,
      draft: {
        ...current.draft,
        [toolId]: enabled,
      },
    }))
  }, [])

  return {
    status: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
    },
    selection: state.draft,
    actions: {
      setToolEnabled,
      async refresh() {
        await reload()
      },
      save,
    },
  }
}
