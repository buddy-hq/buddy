import type {
  Intent,
  Persona,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { TeachingPromptContext } from "../capabilities/lesson-workspace/model/types"
import type { LearnerSnapshot } from "../learner-model/projections/snapshot"
import type { CapabilityEnvelope } from "../shared/runtime-types"

export type PromptTurnSnapshot = {
  persona: Persona
  intent: Intent
  workspaceState: WorkspaceState
}

export type PromptResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type PromptResourceSnapshot = {
  id: string
  alias: string
  sourceRelpath: string
  format: string
  status: PromptResourceStatus
  warnings: string[]
  fullTextPath?: string
  fullTextEstTokens?: number
  fullTextChars?: number
}

export type ActivePromptResourceSnapshot = {
  id?: string
  alias?: string
  title: string
  path: string
  status?: PromptResourceStatus
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
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
  activeResource?: ActivePromptResourceSnapshot
  model?: PromptModelSnapshot
  teachingContext?: TeachingPromptContext
  priorTurn?: PromptTurnSnapshot
}
