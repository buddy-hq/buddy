import type { PromptInjectionAudit, PromptInjectionCache, RuntimePromptSection } from "../../agents/core/prompt/system"
import type { CapabilityEnvelope, LearnerPromptDigest } from "../capabilities/types-model"
import type { PersonaId, SurfaceId, TeachingIntentId, WorkspaceState } from "../capabilities/vocabulary"

export type TeachingLlmOutboundEntry = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  systemPromptSent?: string
  systemPromptBase?: string
  systemPromptEffective?: string
}

export type TeachingSessionState = {
  sessionId: string
  persona: PersonaId
  intentOverride?: TeachingIntentId
  currentSurface: SurfaceId
  workspaceState: WorkspaceState
  focusGoalIds: string[]
  lastLlmOutbound?: TeachingLlmOutboundEntry
  llmOutboundHistory?: TeachingLlmOutboundEntry[]
  promptInjectionCache?: PromptInjectionCache
  inspector?: RuntimeInspectorState
}

export type RuntimeInspectorState = {
  runtimeAgent: PersonaId
  capabilityEnvelope: CapabilityEnvelope
  learnerDigest: LearnerPromptDigest
  advisorySuggestions: string[]
  stableHeader: string
  turnContext: string
  stableHeaderSections: RuntimePromptSection[]
  turnContextSections: RuntimePromptSection[]
  promptInjectionAudit?: PromptInjectionAudit
}
