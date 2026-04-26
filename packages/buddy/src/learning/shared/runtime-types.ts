import type {
  Persona,
  PersonaSurface,
  SubagentId,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { LearningToolId } from "../tools/tool-metadata"

export type ToolId = LearningToolId

export type SkillAccess = "inherit" | "allow" | "deny"
export type SkillDelta<TSkillId extends string = string> = Partial<Record<TSkillId, SkillAccess>>

export type ToolAccess = "inherit" | "allow" | "deny"
export type ToolDelta<TToolId extends string = string> = Partial<Record<TToolId, ToolAccess>>

export type SubagentAccess = "inherit" | "allow" | "deny" | "prefer"
export type SubagentDelta<TSubagentId extends string = string> = Partial<
  Record<TSubagentId, SubagentAccess>
>

export type PersonaContextPolicy = {
  attachCurriculum: boolean
  attachProgress: boolean
  attachTeachingWorkspace: boolean
  attachTeachingPolicy: boolean
  attachFigureContext: boolean
}

export type PersonaDefinition = {
  id: Persona
  label: string
  description: string
  domain: "general" | "coding" | "math"
  surfaces: PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
  toolDefaults: ToolDelta<ToolId>
  skillDefaults: SkillDelta
  subagentDefaults: SubagentDelta<SubagentId>
  contextPolicy: PersonaContextPolicy
}

export type PersonaOverride = {
  label?: string
  description?: string
  surfaces?: PersonaSurface[]
  defaultSurface?: PersonaSurface
  hidden?: boolean
}

export type PersonaCatalogEntry = Pick<
  PersonaDefinition,
  "id" | "label" | "description" | "surfaces" | "defaultSurface" | "hidden"
>

export type CapabilityEnvelope = {
  visibleSurfaces: PersonaSurface[]
  defaultSurface: PersonaSurface
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, "allow" | "deny" | "prefer">
  skills: Record<string, "allow" | "deny">
}

export type RuntimeProfile = {
  persona: Persona
  capabilityEnvelope: CapabilityEnvelope
}
