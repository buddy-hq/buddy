import type {
  ActivityCapabilityMode,
  ActivityKind,
  PersonaId,
  PersonaSurfaceId,
  SubagentId,
  TeachingIntentId,
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
  id: PersonaId
  label: string
  description: string
  domain: "general" | "coding" | "math"
  runtimeAgent: PersonaId
  surfaces: PersonaSurfaceId[]
  defaultSurface: PersonaSurfaceId
  hidden: boolean
  defaultIntent: TeachingIntentId
  toolDefaults: ToolDelta<ToolId>
  subagentDefaults: SubagentDelta<SubagentId>
  contextPolicy: PersonaContextPolicy
}

export type PersonaOverride = {
  label?: string
  description?: string
  surfaces?: PersonaSurfaceId[]
  defaultSurface?: PersonaSurfaceId
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
  intent: TeachingIntentId
  personas: PersonaId[]
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
  intent: TeachingIntentId
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
  visibleSurfaces: PersonaSurfaceId[]
  defaultSurface: PersonaSurfaceId
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, "allow" | "deny" | "prefer">
  skills: Record<string, "allow" | "deny">
  activityBundles: ActivityBundleCapability[]
}

export type RuntimeProfile = {
  key: PersonaId
  persona: PersonaId
  runtimeAgent: PersonaId
  capabilityEnvelope: CapabilityEnvelope
}
