import type {
  Intent,
  Persona,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { CapabilityEnvelope } from "../shared/runtime-types"
import type { TeachingPromptContext } from "../capabilities"
import type { LearnerSnapshot } from "../learner-model"

export type PromptTurnSnapshot = {
  persona: Persona
  intent: Intent
  workspaceState: WorkspaceState
}

export type PromptResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type PromptResourceSnapshot = {
  alias: string
  sourceRelpath: string
  format: string
  status: PromptResourceStatus
  warnings: string[]
  fullTextPath?: string
  fullTextEstTokens?: number
  fullTextChars?: number
}

export type PromptModelSnapshot = {
  providerID: string
  modelID: string
  contextWindow: number
  inputWindow?: number
  outputWindow: number
}

export type SystemPromptCtx = {
  directory: string
  persona: Persona
  capabilityEnvelope: CapabilityEnvelope
  intent: Intent
  learnerSnapshot: LearnerSnapshot
  focusGoalIds: string[]
  resources: PromptResourceSnapshot[]
  model?: PromptModelSnapshot
  teachingContext?: TeachingPromptContext
  priorTurn?: PromptTurnSnapshot
}
