import type { Config } from "@buddy/backend/config"
import type { PersonaDefinition, ToolId } from "../shared/runtime-types"
import { allLearningToolIds, allLearningToolMetadata } from "./tool-metadata"
import { toolMatchesRuntimeConstraints } from "./tool-constraints"

type ToolPermissionAction = "allow" | "deny"
type ToolPermissionMap = Record<ToolId, ToolPermissionAction>
type SkillPermissionMap = Record<string, ToolPermissionAction>

const LEARNING_TOOL_SEARCH_TOOL_ID = "learning_tool_search" as const
const LEARNING_TOOL_LOAD_TOOL_ID = "learning_tool_load" as const

function createDenyToolMap(): ToolPermissionMap {
  return {}
}

function applyPersonaDefaultTools(tools: ToolPermissionMap, persona: PersonaDefinition): void {
  for (const [toolId, access] of Object.entries(persona.tools.static)) {
    if (access === undefined || access === "inherit") continue
    tools[toolId] = access
  }

  if (personaHasDynamicTools(persona)) {
    tools[LEARNING_TOOL_SEARCH_TOOL_ID] = "allow"
    tools[LEARNING_TOOL_LOAD_TOOL_ID] = "allow"
  }
}

function applyRuntimeToolConstraints(tools: ToolPermissionMap): void {
  for (const tool of allLearningToolMetadata()) {
    if (!toolMatchesRuntimeConstraints(tool)) {
      tools[tool.id] = "deny"
    }
  }
}

function applyConfiguredToolToggles(
  tools: ToolPermissionMap,
  configuredToolToggles: Config.Info["tools"] | undefined,
): void {
  if (!configuredToolToggles) {
    return
  }

  for (const toolId of allLearningToolIds()) {
    if (configuredToolToggles[toolId] === false) {
      tools[toolId] = "deny"
    }
  }
}

function collectPersonaDefaultAllowedToolIDs(persona: PersonaDefinition): Set<ToolId> {
  const allowed = new Set<ToolId>()

  for (const toolId of allLearningToolIds()) {
    const access = persona.tools.static[toolId]
    if (access === "allow") {
      allowed.add(toolId)
    }
  }

  if (personaHasDynamicTools(persona)) {
    allowed.add(LEARNING_TOOL_SEARCH_TOOL_ID)
    allowed.add(LEARNING_TOOL_LOAD_TOOL_ID)
  }

  return allowed
}

function buildSkillPermissions(persona: PersonaDefinition) {
  const skills: SkillPermissionMap = {}
  for (const [skillName, access] of Object.entries(persona.skills)) {
    if (!access || access === "inherit") continue
    skills[skillName] = access
  }
  return skills
}

function personaHasDynamicTools(persona: PersonaDefinition): boolean {
  return Object.values(persona.tools.dynamic).some((access) => access === "allow")
}

export function compileRuntimeLearningToolPermissions(input: {
  persona: PersonaDefinition
  configuredToolToggles?: Config.Info["tools"]
}) {
  const tools = createDenyToolMap()
  applyPersonaDefaultTools(tools, input.persona)
  applyRuntimeToolConstraints(tools)
  applyConfiguredToolToggles(tools, input.configuredToolToggles)

  return {
    tools,
    skills: buildSkillPermissions(input.persona),
  }
}

export function deriveStaticPersonaToolPermissions(
  persona: PersonaDefinition,
): Record<ToolId, ToolPermissionAction> {
  const permissions = createDenyToolMap()
  const personaDefaultAllowed = collectPersonaDefaultAllowedToolIDs(persona)

  for (const toolID of allLearningToolIds()) {
    permissions[toolID] = personaDefaultAllowed.has(toolID) ? "allow" : "deny"
  }

  if (personaDefaultAllowed.has(LEARNING_TOOL_SEARCH_TOOL_ID)) {
    permissions[LEARNING_TOOL_SEARCH_TOOL_ID] = "allow"
  }
  if (personaDefaultAllowed.has(LEARNING_TOOL_LOAD_TOOL_ID)) {
    permissions[LEARNING_TOOL_LOAD_TOOL_ID] = "allow"
  }

  return permissions
}
