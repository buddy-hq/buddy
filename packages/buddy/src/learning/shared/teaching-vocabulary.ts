import { BUDDY_SUBAGENTS } from "@buddy/backend/learning/subagent-manifest"

export const PERSONAS = ["buddy", "code-buddy", "math-buddy", "reading-buddy"] as const
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

export const PERSONA_SURFACES = [
  "curriculum",
  "editor",
  "figure",
  "flashcard",
  "question-set",
] as const
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
