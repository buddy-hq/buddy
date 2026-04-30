import type {
  Persona,
  Surface,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { LearnerContextItem } from "./learner-context-delivery"

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
  learnerContextDigest?: string
  lastDeliveredLearnerContextDigest?: string
  lastDeliveredLearnerContextItems?: LearnerContextItem[]
  lastDeliveredLearnerContextMessageId?: string
  lastLlmOutbound?: TeachingLlmOutboundEntry
  llmOutboundHistory?: TeachingLlmOutboundEntry[]
}
