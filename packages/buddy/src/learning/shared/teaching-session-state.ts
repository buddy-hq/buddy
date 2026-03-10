import type {
  Persona,
  Surface,
  Intent,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"

export type TeachingLlmOutboundEntry = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  systemPromptSent?: string
  systemPromptEffective?: string
}

export type TeachingSessionState = {
  sessionId: string
  persona: Persona
  intent: Intent
  currentSurface: Surface
  workspaceState: WorkspaceState
  focusGoalIds: string[]
  lastLlmOutbound?: TeachingLlmOutboundEntry
  llmOutboundHistory?: TeachingLlmOutboundEntry[]
}
