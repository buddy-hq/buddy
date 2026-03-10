import type { PersonaId, SurfaceId, TeachingIntentId, WorkspaceState } from "./vocabulary"

export type TeachingLlmOutboundEntry = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  systemPromptSent?: string
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
}
