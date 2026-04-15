import type { Config } from "@buddy/backend/config"
import {
  WORKSPACE_STATES,
  type Intent,
  type WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { resolveIntentPermissions } from "../intents/capabilities/resolution"
import type { PersonaDefinition, ToolId } from "../shared/runtime-types"
import { allLearningToolIds, allLearningToolMetadata } from "./tool-metadata"
import {
  toolMatchesPersonaWorkspaceConstraints,
  toolMatchesRuntimeConstraints,
} from "./tool-constraints"

type ToolPermissionAction = "allow" | "deny"
type ToolPermissionMap = Record<ToolId, ToolPermissionAction>

function explicitIntents(): Exclude<Intent, "auto">[] {
  return ["learn", "practice", "assess"]
}

function createDenyToolMap(): ToolPermissionMap {
  return {} as ToolPermissionMap
}

function applyPersonaDefaultTools(tools: ToolPermissionMap, persona: PersonaDefinition): void {
  for (const [toolId, access] of Object.entries(persona.toolDefaults) as Array<
    [ToolId, "inherit" | "allow" | "deny"]
  >) {
    if (access === "inherit") continue
    tools[toolId] = access
  }
}

function applyPersonaWorkspaceToolConstraints(input: {
  tools: ToolPermissionMap
  persona: PersonaDefinition
  workspaceState: WorkspaceState
}): void {
  for (const tool of allLearningToolMetadata()) {
    if (
      !toolMatchesPersonaWorkspaceConstraints({
        tool,
        persona: input.persona,
        workspaceState: input.workspaceState,
      })
    ) {
      input.tools[tool.id] = "deny"
    }
  }
}

function applyIntentToolOverrides(input: {
  tools: ToolPermissionMap
  intentToolPermissions: Partial<Record<ToolId, ToolPermissionAction>>
}): void {
  for (const [toolId, access] of Object.entries(input.intentToolPermissions) as Array<
    [ToolId, ToolPermissionAction]
  >) {
    input.tools[toolId] = access
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

  for (const workspaceState of WORKSPACE_STATES) {
    const tools = createDenyToolMap()
    applyPersonaDefaultTools(tools, persona)
    applyPersonaWorkspaceToolConstraints({
      tools,
      persona,
      workspaceState,
    })

    for (const [toolId, access] of Object.entries(tools) as Array<[ToolId, ToolPermissionAction]>) {
      if (access === "allow") {
        allowed.add(toolId)
      }
    }
  }

  return allowed
}

function collectIntentManagedAllowedToolIDs(persona: PersonaDefinition): Set<ToolId> {
  const allowed = new Set<ToolId>()

  for (const intent of explicitIntents()) {
    for (const workspaceState of WORKSPACE_STATES) {
      const intentPermissions = resolveIntentPermissions({
        persona,
        intent,
        workspaceState,
      })

      for (const [toolId, access] of Object.entries(intentPermissions.tools) as Array<
        [ToolId, ToolPermissionAction]
      >) {
        if (access === "allow") {
          allowed.add(toolId)
        }
      }
    }
  }

  return allowed
}

export function compileRuntimeLearningToolPermissions(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
  configuredToolToggles?: Config.Info["tools"]
}): {
  tools: ToolPermissionMap
  skills: Record<string, ToolPermissionAction>
} {
  const intentPermissions = resolveIntentPermissions({
    persona: input.persona,
    intent: input.intent,
    workspaceState: input.workspaceState,
  })

  const tools = createDenyToolMap()
  applyPersonaDefaultTools(tools, input.persona)
  applyPersonaWorkspaceToolConstraints({
    tools,
    persona: input.persona,
    workspaceState: input.workspaceState,
  })
  applyIntentToolOverrides({
    tools,
    intentToolPermissions: intentPermissions.tools,
  })
  applyRuntimeToolConstraints(tools)
  applyConfiguredToolToggles(tools, input.configuredToolToggles)

  return {
    tools,
    skills: intentPermissions.skills,
  }
}

export function deriveStaticPersonaLearningToolPermissions(
  persona: PersonaDefinition,
): Record<ToolId, ToolPermissionAction> {
  const permissions = createDenyToolMap()
  const personaDefaultAllowed = collectPersonaDefaultAllowedToolIDs(persona)
  const intentManagedAllowed = collectIntentManagedAllowedToolIDs(persona)

  for (const toolID of allLearningToolIds()) {
    permissions[toolID] =
      personaDefaultAllowed.has(toolID) || intentManagedAllowed.has(toolID) ? "allow" : "deny"
  }

  return permissions
}
