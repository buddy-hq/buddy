import type {
  ActivityCapabilityMode,
  ActivityKind,
  Persona,
  PersonaSurface,
  SubagentId,
  Intent,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { ToolId } from "./tool-id"
import type { SubagentDelta, ToolDelta } from "./types-primitives"

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
  runtimeAgent: Persona
  surfaces: PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
  defaultIntent: Intent
  toolDefaults: ToolDelta<ToolId>
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

export type SkillCapability = {
  name: string
  access: "allow" | "deny"
}

export type ActivityBundleDefinition = {
  id: string
  activity: ActivityKind
  label: string
  intent: Intent
  personas: Persona[]
  mode: ActivityCapabilityMode
  description: string
  autoEligible: boolean
  whenToUse: string[]
  outputs?: string[]
  skills?: string[]
  tools?: ToolId[]
  subagents?: SubagentId[]
  workspaceStates?: WorkspaceState[]
}

export type ActivityBundleCapability = {
  id: string
  activity: ActivityKind
  label: string
  intent: Intent
  mode: ActivityCapabilityMode
  description: string
  autoEligible: boolean
  whenToUse: string[]
  outputs: string[]
  skills: string[]
  tools: ToolId[]
  subagents: SubagentId[]
}

export type CapabilityEnvelope = {
  visibleSurfaces: PersonaSurface[]
  defaultSurface: PersonaSurface
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, "allow" | "deny" | "prefer">
  skills: Record<string, "allow" | "deny">
  activityBundles: ActivityBundleCapability[]
}

export type RuntimeProfile = {
  key: Persona
  persona: Persona
  runtimeAgent: Persona
  capabilityEnvelope: CapabilityEnvelope
}
