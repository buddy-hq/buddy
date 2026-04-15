import type { SkillCapability } from "./skill-capabilities"
import type { IntentCapabilityManifest } from "./types"
import type { ToolCapability } from "./types"

type IntentCapabilityValidationState = {
  validated: boolean
}

function getIntentCapabilityValidationState(): IntentCapabilityValidationState {
  const intentCapabilityValidationStateKey = "__buddyIntentCapabilityValidationState"
  const globalState = globalThis as typeof globalThis & {
    [intentCapabilityValidationStateKey]?: IntentCapabilityValidationState
  }

  globalState[intentCapabilityValidationStateKey] ??= { validated: false }
  return globalState[intentCapabilityValidationStateKey]
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .toSorted((a, b) => a.localeCompare(b))
}

type ValidationInput = {
  manifests: readonly IntentCapabilityManifest[]
  skillCapabilities: readonly SkillCapability[]
}

function optionalScopeKey(values?: readonly string[]): string {
  if (!values) {
    return ""
  }

  return [...values].toSorted((left, right) => left.localeCompare(right)).join(",")
}

function toolCapabilityScopeKey(capability: ToolCapability): string {
  return [optionalScopeKey(capability.personas), optionalScopeKey(capability.workspaceStates)].join(
    "|",
  )
}

function collectUniqueToolCapabilities(
  manifests: readonly IntentCapabilityManifest[],
): ToolCapability[] {
  const capabilityMap = new Map<string, ToolCapability>()

  for (const manifest of manifests) {
    for (const capability of manifest.toolCapabilities) {
      const key = capability.tool.id
      const existing = capabilityMap.get(key)
      if (existing && toolCapabilityScopeKey(existing) !== toolCapabilityScopeKey(capability)) {
        throw new Error(
          `Tool capability "${key}" must keep the same persona/workspace scope everywhere it is bound`,
        )
      }

      if (!existing) {
        capabilityMap.set(key, capability)
      }
    }
  }

  return [...capabilityMap.values()]
}

function toolCapabilityTopic(key: string) {
  const withoutNamespace = key.startsWith("pedagogy_") ? key.slice("pedagogy_".length) : key
  return withoutNamespace.replaceAll("_", "-")
}

function skillCapabilityTopic(key: string) {
  return key.endsWith("-playbook") ? key.slice(0, -"-playbook".length) : key
}

function assertNoRegistryCollisions(input: ValidationInput) {
  const toolCapabilities = collectUniqueToolCapabilities(input.manifests)
  const duplicateSkillKeys = duplicateValues(
    input.skillCapabilities.map((capability) => capability.key),
  )
  if (duplicateSkillKeys.length > 0) {
    throw new Error(`Duplicate skill capability keys detected: ${duplicateSkillKeys.join(", ")}`)
  }

  const duplicateToolIds = duplicateValues(toolCapabilities.map((capability) => capability.tool.id))
  if (duplicateToolIds.length > 0) {
    throw new Error(
      `Colliding pedagogy tool IDs detected across capabilities: ${duplicateToolIds.join(", ")}`,
    )
  }

  const duplicateSkillNames = duplicateValues(
    input.skillCapabilities.map((capability) => capability.skillName),
  )
  if (duplicateSkillNames.length > 0) {
    throw new Error(
      `Colliding skill names detected across capabilities: ${duplicateSkillNames.join(", ")}`,
    )
  }
}

function assertManifestIntegrity(input: ValidationInput) {
  const knownSkillCapabilityKeys = new Set(
    input.skillCapabilities.map((capability) => capability.key),
  )
  const crossTypeTopics = new Map<string, Set<"tool" | "skill">>()

  for (const manifest of input.manifests) {
    const duplicateToolKeys = duplicateValues(
      manifest.toolCapabilities.map((capability) => capability.tool.id),
    )
    if (duplicateToolKeys.length > 0) {
      throw new Error(
        `Intent manifest "${manifest.intent}" contains duplicate tool capability keys: ${duplicateToolKeys.join(", ")}`,
      )
    }

    const duplicateSkillKeys = duplicateValues(manifest.skillCapabilityKeys)
    if (duplicateSkillKeys.length > 0) {
      throw new Error(
        `Intent manifest "${manifest.intent}" contains duplicate skill capability keys: ${duplicateSkillKeys.join(", ")}`,
      )
    }

    const unknownSkillKeys = manifest.skillCapabilityKeys
      .filter((key) => !knownSkillCapabilityKeys.has(key))
      .toSorted((a, b) => a.localeCompare(b))

    if (unknownSkillKeys.length > 0) {
      throw new Error(
        `Intent manifest "${manifest.intent}" references unknown skill capability keys: ${unknownSkillKeys.join(", ")}`,
      )
    }

    for (const key of manifest.toolCapabilities.map((capability) => capability.tool.id)) {
      const topic = toolCapabilityTopic(key)
      const types = crossTypeTopics.get(topic) ?? new Set<"tool" | "skill">()
      types.add("tool")
      crossTypeTopics.set(topic, types)
    }

    for (const key of manifest.skillCapabilityKeys) {
      const topic = skillCapabilityTopic(key)
      const types = crossTypeTopics.get(topic) ?? new Set<"tool" | "skill">()
      types.add("skill")
      crossTypeTopics.set(topic, types)
    }
  }

  const mixedTopics = [...crossTypeTopics.entries()]
    .filter(([, types]) => types.has("tool") && types.has("skill"))
    .map(([topic]) => topic)
    .toSorted((a, b) => a.localeCompare(b))

  if (mixedTopics.length > 0) {
    throw new Error(
      `Capability topics cannot be both tool and skill. Conflicting topics: ${mixedTopics.join(", ")}`,
    )
  }
}

export function validateIntentCapabilityBindings(input: ValidationInput) {
  assertNoRegistryCollisions(input)
  assertManifestIntegrity(input)
}

export function assertIntentCapabilityBindings(input: ValidationInput) {
  const state = getIntentCapabilityValidationState()
  if (state.validated) return
  validateIntentCapabilityBindings(input)
  state.validated = true
}
