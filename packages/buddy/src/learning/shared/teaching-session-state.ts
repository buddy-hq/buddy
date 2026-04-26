import type {
  Persona,
  Surface,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"

export type TeachingLlmOutboundEntry = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  fullSystemPrompt?: string
}

export type TeachingSessionState = {
  sessionId: string
  persona: Persona
  currentSurface: Surface
  workspaceState: WorkspaceState
  focusGoalIds: string[]
  lastLlmOutbound?: TeachingLlmOutboundEntry
  llmOutboundHistory?: TeachingLlmOutboundEntry[]
}
