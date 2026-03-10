import type { Intent, Persona, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { ActivityBundleCapability, CapabilityEnvelope } from "../shared/runtime-types"
import type { TeachingPromptContext } from "../capabilities"
import type { LearnerSnapshot } from "../learner-model"

export type PromptTurnSnapshot = {
  persona: Persona
  intent?: Intent
  workspaceState: WorkspaceState
}

export type SystemPromptCtx = {
  directory: string
  persona: Persona
  capabilityEnvelope: CapabilityEnvelope
  intent?: Intent
  activityBundle?: ActivityBundleCapability
  learnerSnapshot: LearnerSnapshot
  focusGoalIds: string[]
  teachingContext?: TeachingPromptContext
  priorTurn?: PromptTurnSnapshot
}
