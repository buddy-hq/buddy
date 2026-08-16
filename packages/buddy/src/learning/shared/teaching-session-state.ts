import type {
  Persona,
  Surface,
  TeachingWorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { ResolvedSessionRuntime } from "../access/types"
import type { LearnerContextItem } from "./learner-context-delivery"
import type { TJsonObject } from "../prompt/utils"

export type TeachingLlmOutboundEntry = {
  kind: "message" | "command"
  createdAt: string
  payload: TJsonObject
  fullSystemPrompt?: string
}

export type TeachingSessionState = {
  sessionId: string
  persona: Persona
  currentSurface: Surface
  teachingWorkspaceState: TeachingWorkspaceState
  sessionRuntime?: ResolvedSessionRuntime
  focusGoalIds: string[]
  learnerContextDigest?: string
  lastDeliveredLearnerContextDigest?: string
  lastDeliveredLearnerContextItems?: LearnerContextItem[]
  lastDeliveredLearnerContextMessageId?: string
  readingTurnContextDigest?: string
  lastDeliveredReadingTurnContextDigest?: string
  benchTurnContextDigest?: string
  lastDeliveredBenchTurnContextDigest?: string
  teachingTurnContextDigest?: string
  lastDeliveredTeachingTurnContextDigest?: string
  lastLlmOutbound?: TeachingLlmOutboundEntry
  llmOutboundHistory?: TeachingLlmOutboundEntry[]
}
