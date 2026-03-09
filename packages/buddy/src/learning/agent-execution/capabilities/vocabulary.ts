import { BUNDLED_ACTIVITY_BUNDLES } from "@buddy/backend/learning/agents/curriculum/activities/bundles/data"
import { BUILTIN_BUDDY_PERSONAS } from "@buddy/backend/learning/agents/personas/registry"

type BuiltinPersonaId = keyof typeof BUILTIN_BUDDY_PERSONAS & string

const derivedPersonaIds = Object.keys(BUILTIN_BUDDY_PERSONAS)
  .sort((left, right) => left.localeCompare(right)) as BuiltinPersonaId[]

if (derivedPersonaIds.length === 0) {
  throw new Error("At least one Buddy persona must be defined")
}

export const PERSONA_IDS = [...derivedPersonaIds] as [BuiltinPersonaId, ...BuiltinPersonaId[]]
export type PersonaId = (typeof PERSONA_IDS)[number]

export const TEACHING_INTENT_IDS = ["learn", "practice", "assess"] as const
export type TeachingIntentId = (typeof TEACHING_INTENT_IDS)[number]

export const SURFACE_IDS = ["chat", "curriculum", "editor", "figure", "quiz"] as const
export type SurfaceId = (typeof SURFACE_IDS)[number]

type BuiltinPersonaSurfaceId = (typeof BUILTIN_BUDDY_PERSONAS)[BuiltinPersonaId]["surfaces"][number]

const derivedPersonaSurfaceIds = Array.from(
  new Set(Object.values(BUILTIN_BUDDY_PERSONAS).flatMap((persona) => persona.surfaces)),
).sort((left, right) => left.localeCompare(right)) as BuiltinPersonaSurfaceId[]

if (derivedPersonaSurfaceIds.length === 0) {
  throw new Error("At least one Buddy persona surface must be defined")
}

export const PERSONA_SURFACE_IDS = [...derivedPersonaSurfaceIds] as [
  BuiltinPersonaSurfaceId,
  ...BuiltinPersonaSurfaceId[],
]
export type PersonaSurfaceId = (typeof PERSONA_SURFACE_IDS)[number]

export const WORKSPACE_STATES = ["chat", "interactive"] as const
export type WorkspaceState = (typeof WORKSPACE_STATES)[number]

export const ACTIVITY_KINDS = [
  "goal-setting",
  "explanation",
  "worked-example",
  "analogy",
  "concept-contrast",
  "guided-practice",
  "independent-practice",
  "debug-attempt",
  "stepwise-solve",
  "mastery-check",
  "retrieval-check",
  "transfer-check",
  "review",
  "reflection",
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const SCAFFOLDING_LEVELS = ["worked-example", "guided", "independent", "transfer"] as const
export type ScaffoldingLevel = (typeof SCAFFOLDING_LEVELS)[number]

export const ACTIVITY_CAPABILITY_MODES = ["skill", "tool", "hybrid"] as const
export type ActivityCapabilityMode = (typeof ACTIVITY_CAPABILITY_MODES)[number]

const derivedSubagentIds = Array.from(
  new Set([
    ...Object.values(BUILTIN_BUDDY_PERSONAS).flatMap((persona) => Object.keys(persona.subagentDefaults)),
    ...BUNDLED_ACTIVITY_BUNDLES.flatMap((bundle) => bundle.subagents ?? []),
  ]),
).sort((left, right) => left.localeCompare(right))

export const SUBAGENT_IDS = [...derivedSubagentIds]
export type SubagentId = string

export const TEACHING_INTENT_USER_LABELS: Record<TeachingIntentId, string> = {
  learn: "Understand",
  practice: "Practice",
  assess: "Check",
}

export function isPersonaId(value: string): value is PersonaId {
  return PERSONA_IDS.includes(value as PersonaId)
}

export function isTeachingIntentId(value: string): value is TeachingIntentId {
  return TEACHING_INTENT_IDS.includes(value as TeachingIntentId)
}

export function isPersonaSurfaceId(value: string): value is PersonaSurfaceId {
  return PERSONA_SURFACE_IDS.includes(value as PersonaSurfaceId)
}
