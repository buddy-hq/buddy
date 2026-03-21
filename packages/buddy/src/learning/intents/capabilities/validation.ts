import type { IntentCapabilityManifest } from "./intent-manifests"
import { INTENT_CAPABILITY_MANIFESTS } from "./intent-manifests"
import type { SkillCapability } from "./skill-capabilities"
import { SKILL_CAPABILITY_REGISTRY } from "./skill-capabilities"
import type { ToolCapability } from "./tool-capabilities"
import { TOOL_CAPABILITY_REGISTRY, toolCapabilityKey } from "./tool-capabilities"

let validated = false

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
  toolCapabilities: readonly ToolCapability[]
  skillCapabilities: readonly SkillCapability[]
}

function toolCapabilityTopic(key: string) {
  const withoutNamespace = key.startsWith("pedagogy_") ? key.slice("pedagogy_".length) : key
  return withoutNamespace.replaceAll("_", "-")
}

function skillCapabilityTopic(key: string) {
  return key.endsWith("-playbook") ? key.slice(0, -"-playbook".length) : key
}

function assertNoRegistryCollisions(input: ValidationInput) {
  const duplicateSkillKeys = duplicateValues(
    input.skillCapabilities.map((capability) => capability.key),
  )
  if (duplicateSkillKeys.length > 0) {
    throw new Error(`Duplicate skill capability keys detected: ${duplicateSkillKeys.join(", ")}`)
  }

  const duplicateToolIds = duplicateValues(
    input.toolCapabilities.map((capability) => capability.tool.id),
  )
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
  const knownToolCapabilityKeys = new Set(
    input.toolCapabilities.map((capability) => toolCapabilityKey(capability)),
  )
  const knownSkillCapabilityKeys = new Set(
    input.skillCapabilities.map((capability) => capability.key),
  )
  const crossTypeTopics = new Map<string, Set<"tool" | "skill">>()

  for (const manifest of input.manifests) {
    const duplicateToolKeys = duplicateValues(
      manifest.toolCapabilities.map((capability) => toolCapabilityKey(capability)),
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

    const unknownToolKeys = manifest.toolCapabilities
      .map((capability) => toolCapabilityKey(capability))
      .filter((key) => !knownToolCapabilityKeys.has(key))
      .toSorted((a, b) => a.localeCompare(b))

    if (unknownToolKeys.length > 0) {
      throw new Error(
        `Intent manifest "${manifest.intent}" references unknown tool capability keys: ${unknownToolKeys.join(", ")}`,
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

    for (const key of manifest.toolCapabilities.map((capability) =>
      toolCapabilityKey(capability),
    )) {
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

export function validateIntentCapabilityBindings(input?: Partial<ValidationInput>) {
  const normalizedInput: ValidationInput = {
    manifests: input?.manifests ?? INTENT_CAPABILITY_MANIFESTS,
    toolCapabilities: input?.toolCapabilities ?? TOOL_CAPABILITY_REGISTRY,
    skillCapabilities: input?.skillCapabilities ?? SKILL_CAPABILITY_REGISTRY,
  }

  assertNoRegistryCollisions(normalizedInput)
  assertManifestIntegrity(normalizedInput)
}

export function assertIntentCapabilityBindings() {
  if (validated) return
  validateIntentCapabilityBindings()
  validated = true
}
