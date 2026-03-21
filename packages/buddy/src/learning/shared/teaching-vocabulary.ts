import { BUILTIN_BUDDY_PERSONAS } from "@buddy/backend/learning/personas/registry"

type BuiltinPersona = keyof typeof BUILTIN_BUDDY_PERSONAS & string

const derivedPersonas = Object.keys(BUILTIN_BUDDY_PERSONAS).toSorted((left, right) =>
  left.localeCompare(right),
) as BuiltinPersona[]

if (derivedPersonas.length === 0) {
  throw new Error("At least one Buddy persona must be defined")
}

export const PERSONAS = [...derivedPersonas] as [BuiltinPersona, ...BuiltinPersona[]]
export type Persona = (typeof PERSONAS)[number]

export const INTENTS = ["learn", "practice", "assess", "auto"] as const
export type Intent = (typeof INTENTS)[number]

export const SURFACES = ["chat", "curriculum", "editor", "figure", "quiz"] as const
export type Surface = (typeof SURFACES)[number]

type BuiltinPersonaSurface = (typeof BUILTIN_BUDDY_PERSONAS)[BuiltinPersona]["surfaces"][number]

const derivedPersonaSurfaces = Array.from(
  new Set(Object.values(BUILTIN_BUDDY_PERSONAS).flatMap((persona) => persona.surfaces)),
).toSorted((left, right) => left.localeCompare(right)) as BuiltinPersonaSurface[]

if (derivedPersonaSurfaces.length === 0) {
  throw new Error("At least one Buddy persona surface must be defined")
}

export const PERSONA_SURFACES = [...derivedPersonaSurfaces] as [
  BuiltinPersonaSurface,
  ...BuiltinPersonaSurface[],
]
export type PersonaSurface = (typeof PERSONA_SURFACES)[number]

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

const PEDAGOGY_HELPER_SUBAGENT_IDS = [
  "analogy-author",
  "hint-generator",
  "feedback-engine",
  "solution-checker",
  "rubric-grader",
] as const

const derivedSubagentIds = Array.from(
  new Set([
    ...Object.values(BUILTIN_BUDDY_PERSONAS).flatMap((persona) =>
      Object.keys(persona.subagentDefaults),
    ),
    ...PEDAGOGY_HELPER_SUBAGENT_IDS,
  ]),
).toSorted((left, right) => left.localeCompare(right))

export const SUBAGENT_IDS = [...derivedSubagentIds]
export type SubagentId = string

export const INTENT_LABELS: Record<Intent, string> = {
  learn: "Understand",
  practice: "Practice",
  assess: "Check",
  auto: "Auto",
}

export function isPersona(value: string): value is Persona {
  return PERSONAS.includes(value as Persona)
}

export function isIntent(value: string): value is Intent {
  return INTENTS.includes(value as Intent)
}

export function isPersonaSurface(value: string): value is PersonaSurface {
  return PERSONA_SURFACES.includes(value as PersonaSurface)
}
