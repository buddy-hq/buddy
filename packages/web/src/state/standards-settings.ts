import { readRecord, readToolToggle } from "./project-config-readers"

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

export type StandardsToolDefaults = Record<StandardsToolId, boolean>

const DEFAULT_TOOL_ENABLED = true

export const STANDARDS_TOOL_DISPLAY_NAMES = {
  search_standards: "Search Standards",
  get_standard: "Get Standard",
  get_learning_components: "Get Learning Components",
  get_prerequisites: "Get Prerequisites",
  get_next_standards: "Get Next Standards",
  get_crosswalk: "Get Crosswalk",
  query_standards_sql: "Query Standards SQL",
} satisfies Record<StandardsToolId, string>

export const STANDARDS_TOOL_DESCRIPTIONS = {
  search_standards: "Search for educational standards by query",
  get_standard: "Retrieve detailed information about a specific standard",
  get_learning_components: "Get learning components associated with a standard",
  get_prerequisites: "Retrieve prerequisite standards for a given standard",
  get_next_standards: "Get standards that follow a given standard",
  get_crosswalk: "Get crosswalk mappings between different standard jurisdictions",
  query_standards_sql: "Run a raw read-only SQLite query against the standards database",
} satisfies Record<StandardsToolId, string>

export function buildGlobalStandardsDefaults(
  globalConfig: Record<string, unknown>,
) {
  return {
    search_standards: readToolToggle(globalConfig, "search_standards", DEFAULT_TOOL_ENABLED),
    get_standard: readToolToggle(globalConfig, "get_standard", DEFAULT_TOOL_ENABLED),
    get_learning_components: readToolToggle(
      globalConfig,
      "get_learning_components",
      DEFAULT_TOOL_ENABLED,
    ),
    get_prerequisites: readToolToggle(globalConfig, "get_prerequisites", DEFAULT_TOOL_ENABLED),
    get_next_standards: readToolToggle(globalConfig, "get_next_standards", DEFAULT_TOOL_ENABLED),
    get_crosswalk: readToolToggle(globalConfig, "get_crosswalk", DEFAULT_TOOL_ENABLED),
    query_standards_sql: readToolToggle(globalConfig, "query_standards_sql", DEFAULT_TOOL_ENABLED),
  }
}

export function buildGlobalStandardsPatch(
  globalConfig: Record<string, unknown>,
  nextDefaults: StandardsToolDefaults,
) {
  const toolsPatch: Record<string, boolean> = {}

  for (const toolId of STANDARDS_TOOL_IDS) {
    const currentValue = readToolToggle(globalConfig, toolId, DEFAULT_TOOL_ENABLED)
    if (currentValue !== nextDefaults[toolId]) {
      toolsPatch[toolId] = nextDefaults[toolId]
    }
  }

  return Object.keys(toolsPatch).length > 0 ? { tools: toolsPatch } : undefined
}

function readNotebookStandardsOverride(
  rawProjectConfig: Record<string, unknown>,
  toolId: StandardsToolId,
) {
  const tools = readRecord(rawProjectConfig, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : undefined
}

export function resolveNotebookStandardEnabled(
  globalConfig: Record<string, unknown>,
  rawProjectConfig: Record<string, unknown>,
  toolId: StandardsToolId,
) {
  const override = readNotebookStandardsOverride(rawProjectConfig, toolId)
  return override ?? readToolToggle(globalConfig, toolId, DEFAULT_TOOL_ENABLED)
}

export function notebookStandardUsesGlobalDefault(
  rawProjectConfig: Record<string, unknown>,
  toolId: StandardsToolId,
) {
  return readNotebookStandardsOverride(rawProjectConfig, toolId) === undefined
}

export function buildNotebookStandardsOverridePatch(input: {
  globalConfig: Record<string, unknown>
  rawProjectConfig: Record<string, unknown>
  toolId: StandardsToolId
  enabled: boolean
}) {
  const currentOverride = readNotebookStandardsOverride(input.rawProjectConfig, input.toolId)
  const defaultEnabled = readToolToggle(input.globalConfig, input.toolId, DEFAULT_TOOL_ENABLED)
  const nextOverride = input.enabled === defaultEnabled ? undefined : input.enabled

  if (currentOverride === nextOverride) {
    return undefined
  }

  return {
    tools: {
      [input.toolId]: nextOverride ?? null,
    },
  }
}
