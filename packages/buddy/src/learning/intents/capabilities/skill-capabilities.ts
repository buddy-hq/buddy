import type { Persona, WorkspaceState } from '@buddy/backend/learning/shared/teaching-vocabulary'

export type SkillCapability = {
  key: string
  skillName: string
  personas?: Persona[]
  workspaceStates?: WorkspaceState[]
}

function createSkillCapability<const Key extends string>(
  capability: SkillCapability & { key: Key },
) {
  return capability
}

export const explanationPlaybookSkillCapability = createSkillCapability({
  key: 'explanation-playbook',
  skillName: 'buddy-pedagogy-explanation',
})

export const workedExamplePlaybookSkillCapability = createSkillCapability({
  key: 'worked-example-playbook',
  skillName: 'buddy-pedagogy-worked-example',
})

export const conceptContrastPlaybookSkillCapability = createSkillCapability({
  key: 'concept-contrast-playbook',
  skillName: 'buddy-pedagogy-concept-contrast',
})

export const analogyPlaybookSkillCapability = createSkillCapability({
  key: 'analogy-playbook',
  skillName: 'buddy-pedagogy-analogy',
  personas: ['buddy', 'math-buddy'],
})

export const SKILL_CAPABILITY_REGISTRY = [
  explanationPlaybookSkillCapability,
  workedExamplePlaybookSkillCapability,
  conceptContrastPlaybookSkillCapability,
  analogyPlaybookSkillCapability,
] as const satisfies readonly SkillCapability[]

export type SkillCapabilityKey = (typeof SKILL_CAPABILITY_REGISTRY)[number]['key']

export function listSkillCapabilities(): SkillCapability[] {
  return SKILL_CAPABILITY_REGISTRY.map((capability) => ({
    key: capability.key,
    skillName: capability.skillName,
    ...(capability.personas ? { personas: [...capability.personas] } : {}),
    ...(capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {}),
  }))
}

export function managedSkillNames(): string[] {
  return Array.from(
    new Set(SKILL_CAPABILITY_REGISTRY.map((capability) => capability.skillName)),
  ).sort((a, b) => a.localeCompare(b))
}
