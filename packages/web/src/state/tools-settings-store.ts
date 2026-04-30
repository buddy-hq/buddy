import { createStore } from "zustand/vanilla"
import { readRecord, readToolToggle } from "./project-config-readers"
import type { ToolsSettingsBundle } from "./tools-settings-query"

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
export type ToolsToggleDraft = Record<StandardsToolId, boolean>
export type ToolsOverrideDraft = Record<StandardsToolId, StandardsToolOverrideMode>
export type GlobalToolsSettingsPatch = {
  tools?: Record<string, boolean>
}
export type ProjectToolsSettingsPatch = {
  tools?: Record<string, boolean | null>
}

type ToolsSettingsState = {
  saving: boolean
  error?: string
  initializedDirectory?: string
  globalDraft: ToolsToggleDraft
  projectDraft: ToolsOverrideDraft
}

type ToolsSettingsStoreState = ToolsSettingsState & {
  initializeFromBundle: (directory: string, bundle: ToolsSettingsBundle) => void
  replaceFromBundle: (directory: string, bundle: ToolsSettingsBundle) => void
  finishSaving: (directory: string) => void
  startSaving: () => void
  failSaving: (errorMessage: string) => void
  setError: (error?: string) => void
  setGlobalToolEnabled: (toolId: StandardsToolId, enabled: boolean) => void
  setAllGlobalToolsEnabled: (enabled: boolean) => void
  setProjectToolMode: (toolId: StandardsToolId, mode: StandardsToolOverrideMode) => void
}

const DEFAULT_TOOL_ENABLED = true
const EMPTY_GLOBAL_DRAFT: ToolsToggleDraft = {
  search_standards: DEFAULT_TOOL_ENABLED,
  get_standard: DEFAULT_TOOL_ENABLED,
  get_learning_components: DEFAULT_TOOL_ENABLED,
  get_prerequisites: DEFAULT_TOOL_ENABLED,
  get_next_standards: DEFAULT_TOOL_ENABLED,
  get_crosswalk: DEFAULT_TOOL_ENABLED,
  query_standards_sql: DEFAULT_TOOL_ENABLED,
}
const EMPTY_PROJECT_DRAFT: ToolsOverrideDraft = {
  search_standards: TOOL_OVERRIDE_MODE.inherit,
  get_standard: TOOL_OVERRIDE_MODE.inherit,
  get_learning_components: TOOL_OVERRIDE_MODE.inherit,
  get_prerequisites: TOOL_OVERRIDE_MODE.inherit,
  get_next_standards: TOOL_OVERRIDE_MODE.inherit,
  get_crosswalk: TOOL_OVERRIDE_MODE.inherit,
  query_standards_sql: TOOL_OVERRIDE_MODE.inherit,
}

function readExplicitToolToggle(
  input: Record<string, unknown>,
  toolId: StandardsToolId,
): boolean | undefined {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : undefined
}

export function buildGlobalToolsDraft(config: Record<string, unknown>): ToolsToggleDraft {
  const draft: ToolsToggleDraft = { ...EMPTY_GLOBAL_DRAFT }

  for (const toolId of STANDARDS_TOOL_IDS) {
    draft[toolId] = readToolToggle(config, toolId, DEFAULT_TOOL_ENABLED)
  }

  return draft
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

export function buildProjectToolsDraft(config: Record<string, unknown>): ToolsOverrideDraft {
  const draft: ToolsOverrideDraft = { ...EMPTY_PROJECT_DRAFT }

  for (const toolId of STANDARDS_TOOL_IDS) {
    draft[toolId] = readToolOverrideMode(config, toolId)
  }

  return draft
}

export function resolveEffectiveToolSelection(
  globalDraft: ToolsToggleDraft,
  projectDraft: ToolsOverrideDraft,
): ToolsToggleDraft {
  const effective: ToolsToggleDraft = { ...EMPTY_GLOBAL_DRAFT }

  for (const toolId of STANDARDS_TOOL_IDS) {
    effective[toolId] =
      projectDraft[toolId] === TOOL_OVERRIDE_MODE.inherit
        ? globalDraft[toolId]
        : projectDraft[toolId] === TOOL_OVERRIDE_MODE.enabled
  }

  return effective
}

export function buildGlobalToolsPatch(
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

export function buildProjectToolsPatch(
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

export function buildGlobalToolsRollbackPatch(
  nextGlobalConfig: Record<string, unknown>,
  previousGlobalConfig: Record<string, unknown>,
) {
  return buildGlobalToolsPatch(nextGlobalConfig, buildGlobalToolsDraft(previousGlobalConfig))
}

export function writeProjectToolsConfig(
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

export function writeGlobalToolsConfig(
  globalConfig: Record<string, unknown>,
  globalDraft: ToolsToggleDraft,
): Record<string, unknown> {
  const currentTools = readRecord(globalConfig, "tools")
  const nextTools: Record<string, unknown> = currentTools ? { ...currentTools } : {}

  for (const toolId of STANDARDS_TOOL_IDS) {
    nextTools[toolId] = globalDraft[toolId]
  }

  return {
    ...globalConfig,
    tools: nextTools,
  }
}

function emptyToolsSettingsState(): ToolsSettingsState {
  return {
    saving: false,
    error: undefined,
    initializedDirectory: undefined,
    globalDraft: { ...EMPTY_GLOBAL_DRAFT },
    projectDraft: { ...EMPTY_PROJECT_DRAFT },
  }
}

export function createToolsSettingsStore() {
  return createStore<ToolsSettingsStoreState>()((set, get) => ({
    ...emptyToolsSettingsState(),
    initializeFromBundle(directory, bundle) {
      if (get().initializedDirectory === directory) {
        return
      }

      set({
        saving: false,
        error: undefined,
        initializedDirectory: directory,
        globalDraft: buildGlobalToolsDraft(bundle.globalConfig),
        projectDraft: buildProjectToolsDraft(bundle.rawProjectConfig),
      })
    },
    replaceFromBundle(directory, bundle) {
      set({
        saving: false,
        error: undefined,
        initializedDirectory: directory,
        globalDraft: buildGlobalToolsDraft(bundle.globalConfig),
        projectDraft: buildProjectToolsDraft(bundle.rawProjectConfig),
      })
    },
    finishSaving(directory) {
      set({
        saving: false,
        error: undefined,
        initializedDirectory: directory,
      })
    },
    startSaving() {
      set({
        saving: true,
        error: undefined,
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
    setGlobalToolEnabled(toolId, enabled) {
      set((current) => ({
        globalDraft: {
          ...current.globalDraft,
          [toolId]: enabled,
        },
      }))
    },
    setAllGlobalToolsEnabled(enabled) {
      set((current) => {
        const nextDraft: ToolsToggleDraft = { ...current.globalDraft }
        for (const toolId of STANDARDS_TOOL_IDS) {
          nextDraft[toolId] = enabled
        }

        return {
          globalDraft: nextDraft,
        }
      })
    },
    setProjectToolMode(toolId, mode) {
      set((current) => ({
        projectDraft: {
          ...current.projectDraft,
          [toolId]: mode,
        },
      }))
    },
  }))
}

export type ToolsSettingsStore = ReturnType<typeof createToolsSettingsStore>
