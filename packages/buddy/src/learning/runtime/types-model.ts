import type {
  ActivityCapabilityMode,
  ActivityKind,
  PersonaId,
  PersonaSurfaceId,
  SubagentDelta,
  SubagentId,
  TeachingIntentId,
  ToolDelta,
  ToolId,
  WorkspaceState,
} from "../../runtime-contract/types-primitives.js"

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
  toolDefaults: ToolDelta
  subagentDefaults: SubagentDelta
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

export type LearnerPromptDigest = {
  coldStart: boolean
  workspaceLabel: string
  workspaceTags: string[]
  relevantGoalIds: string[]
  recommendedNextAction: ActivityKind
  constraintsSummary: string[]
  openFeedbackActions: string[]
  sessionPlanSummary: string[]
  alignmentSummary: string[]
  tier1: string[]
  tier2: string[]
  tier3: string[]
}

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
