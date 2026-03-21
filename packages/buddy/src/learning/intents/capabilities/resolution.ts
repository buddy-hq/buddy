import type { Intent, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PersonaDefinition, ToolId } from "../../shared/runtime-types"
import { INTENT_CAPABILITY_MANIFESTS } from "./intent-manifests"
import { SKILL_CAPABILITY_REGISTRY, managedSkillNames } from "./skill-capabilities"
import type { ToolCapability } from "./tool-capabilities"
import { TOOL_CAPABILITY_REGISTRY, toolCapabilityKey } from "./tool-capabilities"
import { assertIntentCapabilityBindings } from "./validation"

type PermissionAction = "allow" | "deny"

type IntentPermissionResolution = {
  tools: Partial<Record<ToolId, PermissionAction>>
  skills: Record<string, PermissionAction>
}

function matchesPersonaAndWorkspace(input: {
  personas?: readonly string[]
  workspaceStates?: readonly WorkspaceState[]
  persona: PersonaDefinition
  workspaceState: WorkspaceState
}) {
  if (input.personas && !input.personas.includes(input.persona.id)) {
    return false
  }

  if (input.workspaceStates && !input.workspaceStates.includes(input.workspaceState)) {
    return false
  }

  return true
}

function resolveIntentScope(intent: Intent) {
  return intent === "auto" ? (["learn", "practice", "assess"] as const) : [intent]
}

function buildDenyMap<T extends string>(values: readonly T[]): Record<T, PermissionAction> {
  return Object.fromEntries(values.map((value) => [value, "deny"])) as Record<T, PermissionAction>
}

function dedupeToolCapabilities(values: readonly ToolCapability[]): ToolCapability[] {
  const byKey = new Map<string, ToolCapability>()
  for (const value of values) {
    byKey.set(toolCapabilityKey(value), value)
  }
  return [...byKey.values()]
}

export function resolveIntentPermissions(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
}): IntentPermissionResolution {
  assertIntentCapabilityBindings()

  const selectedIntents = new Set(resolveIntentScope(input.intent))
  const manifests = INTENT_CAPABILITY_MANIFESTS.filter((manifest) =>
    selectedIntents.has(manifest.intent),
  )

  const selectedToolCapabilities = dedupeToolCapabilities(
    manifests.flatMap((manifest) => manifest.toolCapabilities),
  )
  const skillCapabilityKeys = new Set(manifests.flatMap((manifest) => manifest.skillCapabilityKeys))

  const allowedToolIds = new Set(
    selectedToolCapabilities
      .filter((capability) =>
        matchesPersonaAndWorkspace({
          personas: capability.personas,
          workspaceStates: capability.workspaceStates,
          persona: input.persona,
          workspaceState: input.workspaceState,
        }),
      )
      .map((capability) => capability.tool.id),
  )

  const managedToolIds = TOOL_CAPABILITY_REGISTRY.map((capability) => capability.tool.id).toSorted(
    (a, b) => a.localeCompare(b),
  )

  const toolPermissions = buildDenyMap(managedToolIds)
  for (const toolId of allowedToolIds) {
    toolPermissions[toolId] = "allow"
  }

  const allowedSkillNames = new Set(
    SKILL_CAPABILITY_REGISTRY.filter((capability) => skillCapabilityKeys.has(capability.key))
      .filter((capability) =>
        matchesPersonaAndWorkspace({
          personas: capability.personas,
          workspaceStates: capability.workspaceStates,
          persona: input.persona,
          workspaceState: input.workspaceState,
        }),
      )
      .map((capability) => capability.skillName),
  )

  const managedNames = managedSkillNames()
  const skillPermissions = buildDenyMap(managedNames)
  for (const skillName of allowedSkillNames) {
    skillPermissions[skillName] = "allow"
  }

  return {
    tools: toolPermissions,
    skills: skillPermissions,
  }
}

export function pedagogyManagedSkillNames() {
  assertIntentCapabilityBindings()
  return managedSkillNames()
}
