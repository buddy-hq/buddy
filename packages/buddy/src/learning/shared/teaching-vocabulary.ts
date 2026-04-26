import { REGISTERED_BUDDY_PERSONAS } from "@buddy/backend/learning/personas/registered-personas"
import { BUDDY_SUBAGENTS } from "@buddy/backend/learning/subagent-manifest"

type BuiltinPersona = (typeof REGISTERED_BUDDY_PERSONAS)[number]["id"]

const derivedPersonas = REGISTERED_BUDDY_PERSONAS.map(
  (definition) => definition.id,
) as BuiltinPersona[]

if (derivedPersonas.length === 0) {
  throw new Error("At least one Buddy persona must be defined")
}

export const PERSONAS = [...derivedPersonas] as [BuiltinPersona, ...BuiltinPersona[]]
export type Persona = (typeof PERSONAS)[number]

export const SURFACES = [
  "chat",
  "curriculum",
  "editor",
  "figure",
  "flashcard",
  "question-set",
] as const
export type Surface = (typeof SURFACES)[number]

type BuiltinPersonaSurface = (typeof REGISTERED_BUDDY_PERSONAS)[number]["surfaces"][number]

const derivedPersonaSurfaces = Array.from(
  new Set(REGISTERED_BUDDY_PERSONAS.flatMap((definition) => definition.surfaces)),
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

export const SCAFFOLDING_LEVELS = ["worked-example", "guided", "independent", "transfer"] as const
export type ScaffoldingLevel = (typeof SCAFFOLDING_LEVELS)[number]

type BuiltinSubagentId = (typeof BUDDY_SUBAGENTS)[number]["key"]

const derivedSubagentIds = BUDDY_SUBAGENTS.map(({ key }) => key) as BuiltinSubagentId[]

export const SUBAGENT_IDS = [...derivedSubagentIds] as [BuiltinSubagentId, ...BuiltinSubagentId[]]
export type SubagentId = (typeof SUBAGENT_IDS)[number]

export function isPersona(value: string): value is Persona {
  return PERSONAS.includes(value as Persona)
}

export function isPersonaSurface(value: string): value is PersonaSurface {
  return PERSONA_SURFACES.includes(value as PersonaSurface)
}
