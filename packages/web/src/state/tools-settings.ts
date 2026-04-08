import { useCallback, useEffect, useRef, useState } from "react"
import {
  loadGlobalConfig,
  loadRawProjectConfig,
  patchGlobalConfig,
  patchProjectConfig,
} from "./chat-actions"

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

export const TOOL_OVERRIDE_MODE = {
  inherit: "inherit",
  enabled: "enabled",
  disabled: "disabled",
} as const

export type StandardsToolOverrideMode = (typeof TOOL_OVERRIDE_MODE)[keyof typeof TOOL_OVERRIDE_MODE]

type ToolsToggleDraft = Record<StandardsToolId, boolean>
type ToolsOverrideDraft = Record<StandardsToolId, StandardsToolOverrideMode>

type GlobalToolsSettingsPatch = {
  tools?: Record<string, boolean>
}

type ProjectToolsSettingsPatch = {
  tools?: Record<string, boolean | null>
}

type ToolsSettingsState = {
  loading: boolean
  saving: boolean
  error?: string
  globalConfig: Record<string, unknown>
  rawProjectConfig: Record<string, unknown>
  globalDraft: ToolsToggleDraft
  projectDraft: ToolsOverrideDraft
}

type PersistSnapshot = {
  directory: string
  open: boolean
  loading: boolean
  saving: boolean
  globalPatch?: GlobalToolsSettingsPatch
  projectPatch?: ProjectToolsSettingsPatch
}

const DEFAULT_TOOL_ENABLED = true
const AUTO_SAVE_DELAY_MS = 250

function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function readToolToggle(
  input: Record<string, unknown>,
  toolId: StandardsToolId,
  fallback: boolean,
): boolean {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : fallback
}

function readExplicitToolToggle(
  input: Record<string, unknown>,
  toolId: StandardsToolId,
): boolean | undefined {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : undefined
}

function buildGlobalDraft(config: Record<string, unknown>): ToolsToggleDraft {
  return {
    search_standards: readToolToggle(config, "search_standards", DEFAULT_TOOL_ENABLED),
    get_standard: readToolToggle(config, "get_standard", DEFAULT_TOOL_ENABLED),
    get_learning_components: readToolToggle(
      config,
      "get_learning_components",
      DEFAULT_TOOL_ENABLED,
    ),
    get_prerequisites: readToolToggle(config, "get_prerequisites", DEFAULT_TOOL_ENABLED),
    get_next_standards: readToolToggle(config, "get_next_standards", DEFAULT_TOOL_ENABLED),
    get_crosswalk: readToolToggle(config, "get_crosswalk", DEFAULT_TOOL_ENABLED),
    query_standards_sql: readToolToggle(config, "query_standards_sql", DEFAULT_TOOL_ENABLED),
  }
}

function readToolOverrideMode(
  config: Record<string, unknown>,
  toolId: StandardsToolId,
): StandardsToolOverrideMode {
  const value = readExplicitToolToggle(config, toolId)
  if (value === true) return TOOL_OVERRIDE_MODE.enabled
  if (value === false) return TOOL_OVERRIDE_MODE.disabled
  return TOOL_OVERRIDE_MODE.inherit
}

function buildProjectDraft(config: Record<string, unknown>): ToolsOverrideDraft {
  return {
    search_standards: readToolOverrideMode(config, "search_standards"),
    get_standard: readToolOverrideMode(config, "get_standard"),
    get_learning_components: readToolOverrideMode(config, "get_learning_components"),
    get_prerequisites: readToolOverrideMode(config, "get_prerequisites"),
    get_next_standards: readToolOverrideMode(config, "get_next_standards"),
    get_crosswalk: readToolOverrideMode(config, "get_crosswalk"),
    query_standards_sql: readToolOverrideMode(config, "query_standards_sql"),
  }
}

function resolveEffectiveSelection(
  globalDraft: ToolsToggleDraft,
  projectDraft: ToolsOverrideDraft,
): ToolsToggleDraft {
  return {
    search_standards:
      projectDraft.search_standards === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.search_standards
        : projectDraft.search_standards === TOOL_OVERRIDE_MODE.enabled,
    get_standard:
      projectDraft.get_standard === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.get_standard
        : projectDraft.get_standard === TOOL_OVERRIDE_MODE.enabled,
    get_learning_components:
      projectDraft.get_learning_components === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.get_learning_components
        : projectDraft.get_learning_components === TOOL_OVERRIDE_MODE.enabled,
    get_prerequisites:
      projectDraft.get_prerequisites === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.get_prerequisites
        : projectDraft.get_prerequisites === TOOL_OVERRIDE_MODE.enabled,
    get_next_standards:
      projectDraft.get_next_standards === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.get_next_standards
        : projectDraft.get_next_standards === TOOL_OVERRIDE_MODE.enabled,
    get_crosswalk:
      projectDraft.get_crosswalk === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.get_crosswalk
        : projectDraft.get_crosswalk === TOOL_OVERRIDE_MODE.enabled,
    query_standards_sql:
      projectDraft.query_standards_sql === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft.query_standards_sql
        : projectDraft.query_standards_sql === TOOL_OVERRIDE_MODE.enabled,
  }
}

function buildGlobalPatch(
  globalConfig: Record<string, unknown>,
  globalDraft: ToolsToggleDraft,
): GlobalToolsSettingsPatch | undefined {
  const toolsPatch: Record<string, boolean> = {}
  let hasChanges = false

  for (const toolId of STANDARDS_TOOL_IDS) {
    const currentValue = readToolToggle(globalConfig, toolId, DEFAULT_TOOL_ENABLED)
    if (globalDraft[toolId] !== currentValue) {
      toolsPatch[toolId] = globalDraft[toolId]
      hasChanges = true
    }
  }

  return hasChanges ? { tools: toolsPatch } : undefined
}

function buildProjectPatch(
  rawProjectConfig: Record<string, unknown>,
  projectDraft: ToolsOverrideDraft,
): ProjectToolsSettingsPatch | undefined {
  const toolsPatch: Record<string, boolean | null> = {}
  let hasChanges = false

  for (const toolId of STANDARDS_TOOL_IDS) {
    const currentValue = readExplicitToolToggle(rawProjectConfig, toolId)
    const nextMode = projectDraft[toolId]
    const nextValue =
      nextMode === TOOL_OVERRIDE_MODE.inherit ? undefined : nextMode !== TOOL_OVERRIDE_MODE.disabled

    if (nextValue === undefined) {
      if (currentValue !== undefined) {
        toolsPatch[toolId] = null
        hasChanges = true
      }
      continue
    }

    if (currentValue !== nextValue) {
      toolsPatch[toolId] = nextValue
      hasChanges = true
    }
  }

  return hasChanges ? { tools: toolsPatch } : undefined
}

function buildGlobalRollbackPatch(
  nextGlobalConfig: Record<string, unknown>,
  previousGlobalConfig: Record<string, unknown>,
) {
  return buildGlobalPatch(nextGlobalConfig, buildGlobalDraft(previousGlobalConfig))
}

function writeProjectToolsConfig(
  rawProjectConfig: Record<string, unknown>,
  projectDraft: ToolsOverrideDraft,
): Record<string, unknown> {
  const currentTools = readRecord(rawProjectConfig, "tools")
  const nextTools: Record<string, unknown> = currentTools ? { ...currentTools } : {}

  for (const toolId of STANDARDS_TOOL_IDS) {
    const mode = projectDraft[toolId]
    if (mode === TOOL_OVERRIDE_MODE.inherit) {
      delete nextTools[toolId]
      continue
    }

    nextTools[toolId] = mode === TOOL_OVERRIDE_MODE.enabled
  }

  if (Object.keys(nextTools).length === 0) {
    const { tools: _tools, ...rest } = rawProjectConfig
    return rest
  }

  return {
    ...rawProjectConfig,
    tools: nextTools,
  }
}

function emptyState(): ToolsSettingsState {
  return {
    loading: false,
    saving: false,
    error: undefined,
    globalConfig: {},
    rawProjectConfig: {},
    globalDraft: {
      search_standards: DEFAULT_TOOL_ENABLED,
      get_standard: DEFAULT_TOOL_ENABLED,
      get_learning_components: DEFAULT_TOOL_ENABLED,
      get_prerequisites: DEFAULT_TOOL_ENABLED,
      get_next_standards: DEFAULT_TOOL_ENABLED,
      get_crosswalk: DEFAULT_TOOL_ENABLED,
      query_standards_sql: DEFAULT_TOOL_ENABLED,
    },
    projectDraft: {
      search_standards: TOOL_OVERRIDE_MODE.inherit,
      get_standard: TOOL_OVERRIDE_MODE.inherit,
      get_learning_components: TOOL_OVERRIDE_MODE.inherit,
      get_prerequisites: TOOL_OVERRIDE_MODE.inherit,
      get_next_standards: TOOL_OVERRIDE_MODE.inherit,
      get_crosswalk: TOOL_OVERRIDE_MODE.inherit,
      query_standards_sql: TOOL_OVERRIDE_MODE.inherit,
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
  const [state, setState] = useState<ToolsSettingsState>(() => emptyState())
  const latestPersistRef = useRef<PersistSnapshot>({
    directory,
    open: false,
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
      const [globalConfig, rawProjectConfig] = await Promise.all([
        loadGlobalConfig(),
        loadRawProjectConfig(directory),
      ])

      setState({
        loading: false,
        saving: false,
        error: undefined,
        globalConfig,
        rawProjectConfig,
        globalDraft: buildGlobalDraft(globalConfig),
        projectDraft: buildProjectDraft(rawProjectConfig),
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
    const globalPatch = buildGlobalPatch(state.globalConfig, state.globalDraft)
    const projectPatch = buildProjectPatch(state.rawProjectConfig, state.projectDraft)

    if (!globalPatch && !projectPatch) {
      return true
    }

    setState((current) => ({
      ...current,
      saving: true,
      error: undefined,
    }))

    const nextGlobalConfig =
      globalPatch === undefined
        ? state.globalConfig
        : (() => {
            const currentTools = readRecord(state.globalConfig, "tools")
            return {
              ...state.globalConfig,
              tools: {
                ...currentTools,
                ...Object.fromEntries(
                  STANDARDS_TOOL_IDS.map((toolId) => [toolId, state.globalDraft[toolId]]),
                ),
              },
            }
          })()
    const nextRawProjectConfig =
      projectPatch === undefined
        ? state.rawProjectConfig
        : writeProjectToolsConfig(state.rawProjectConfig, state.projectDraft)

    try {
      if (globalPatch) {
        await patchGlobalConfig(globalPatch)
      }

      if (projectPatch) {
        await patchProjectConfig(directory, projectPatch)
      }

      setState((current) => ({
        ...current,
        saving: false,
        error: undefined,
        globalConfig: nextGlobalConfig,
        rawProjectConfig: nextRawProjectConfig,
      }))
      return true
    } catch (error) {
      let rollbackError: unknown

      if (globalPatch && projectPatch) {
        const rollbackPatch = buildGlobalRollbackPatch(nextGlobalConfig, state.globalConfig)
        if (rollbackPatch) {
          try {
            await patchGlobalConfig(rollbackPatch)
          } catch (candidate) {
            rollbackError = candidate
          }
        }
      }

      const errorMessage = stringifyError(error)
      await reload().catch(() => false)
      setState((current) => ({
        ...current,
        error:
          rollbackError === undefined
            ? errorMessage
            : `${errorMessage}. Global defaults may have been saved while notebook overrides failed.`,
      }))
      return false
    }
  }, [
    directory,
    reload,
    state.globalConfig,
    state.globalDraft,
    state.projectDraft,
    state.rawProjectConfig,
  ])

  useEffect(() => {
    if (!open || state.loading || state.saving) {
      return
    }

    const globalPatch = buildGlobalPatch(state.globalConfig, state.globalDraft)
    const projectPatch = buildProjectPatch(state.rawProjectConfig, state.projectDraft)
    if (!globalPatch && !projectPatch) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    open,
    save,
    state.globalConfig,
    state.globalDraft,
    state.loading,
    state.projectDraft,
    state.rawProjectConfig,
    state.saving,
  ])

  useEffect(() => {
    latestPersistRef.current = {
      directory,
      open,
      loading: state.loading,
      saving: state.saving,
      globalPatch: buildGlobalPatch(state.globalConfig, state.globalDraft),
      projectPatch: buildProjectPatch(state.rawProjectConfig, state.projectDraft),
    }
  }, [
    directory,
    open,
    state.globalConfig,
    state.globalDraft,
    state.loading,
    state.projectDraft,
    state.rawProjectConfig,
    state.saving,
  ])

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

  const setGlobalToolEnabled = useCallback((toolId: StandardsToolId, enabled: boolean) => {
    setState((current) => ({
      ...current,
      globalDraft: {
        ...current.globalDraft,
        [toolId]: enabled,
      },
    }))
  }, [])

  const setAllGlobalToolsEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      globalDraft: {
        search_standards: enabled,
        get_standard: enabled,
        get_learning_components: enabled,
        get_prerequisites: enabled,
        get_next_standards: enabled,
        get_crosswalk: enabled,
        query_standards_sql: enabled,
      },
    }))
  }, [])

  const setProjectToolMode = useCallback(
    (toolId: StandardsToolId, mode: StandardsToolOverrideMode) => {
      setState((current) => ({
        ...current,
        projectDraft: {
          ...current.projectDraft,
          [toolId]: mode,
        },
      }))
    },
    [],
  )

  const globalPatch = buildGlobalPatch(state.globalConfig, state.globalDraft)
  const projectPatch = buildProjectPatch(state.rawProjectConfig, state.projectDraft)
  const effectiveSelection = resolveEffectiveSelection(state.globalDraft, state.projectDraft)

  return {
    status: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      hasPendingChanges: Boolean(globalPatch || projectPatch),
    },
    selection: {
      globalDefaults: state.globalDraft,
      notebookOverrides: state.projectDraft,
      effective: effectiveSelection,
    },
    actions: {
      setGlobalToolEnabled,
      setAllGlobalToolsEnabled,
      setProjectToolMode,
      async refresh() {
        await reload()
      },
      save,
    },
  }
}
