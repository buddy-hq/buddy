export const PERSONAS = ["buddy", "code-buddy"] as const
export type Persona = (typeof PERSONAS)[number]

export const PRIMARY_USES = ["learn", "teach"] as const
export type PrimaryUse = (typeof PRIMARY_USES)[number]

export const SURFACES = ["curriculum", "editor", "flashcard", "question-set"] as const
export type Surface = (typeof SURFACES)[number]

export const PERSONA_SURFACES = ["curriculum", "editor", "flashcard", "question-set"] as const
export type PersonaSurface = (typeof PERSONA_SURFACES)[number]

export const TEACHING_WORKSPACE_STATES = ["inactive", "active"] as const
export type TeachingWorkspaceState = (typeof TEACHING_WORKSPACE_STATES)[number]

export const SCAFFOLDING_LEVELS = ["worked-example", "guided", "independent", "transfer"] as const
export type ScaffoldingLevel = (typeof SCAFFOLDING_LEVELS)[number]

export const SUBAGENT_IDS = [
  "assessment-agent",
  "curriculum-orchestrator",
  "practice-agent",
  "goal-writer",
  "question-set-author",
  "learner-memory-consolidator",
  "flashcard-author",
] as const
export type SubagentId = (typeof SUBAGENT_IDS)[number]

export const NATIVE_DELEGATE_IDS = ["general", "explore"] as const
export type NativeDelegateId = (typeof NATIVE_DELEGATE_IDS)[number]

export const PERSONA_DELEGATE_IDS = [...SUBAGENT_IDS, ...NATIVE_DELEGATE_IDS] as const
export type PersonaDelegateId = (typeof PERSONA_DELEGATE_IDS)[number]

export function isPersona(value: string): value is Persona {
  return PERSONAS.includes(value as Persona)
}

export function isPrimaryUse(value: string): value is PrimaryUse {
  return PRIMARY_USES.some((primaryUse) => primaryUse === value)
}

export function isPersonaSurface(value: string): value is PersonaSurface {
  return PERSONA_SURFACES.includes(value as PersonaSurface)
}

export function isSubagentId(value: string): value is SubagentId {
  return SUBAGENT_IDS.includes(value as SubagentId)
}

export function isPersonaDelegateId(value: string): value is PersonaDelegateId {
  return PERSONA_DELEGATE_IDS.includes(value as PersonaDelegateId)
}
