import type {
  ActivityBundleCapability,
  RuntimeProfile,
  TeachingIntentId,
} from "../../runtime/types"
import type { PromptRuntimeState } from "../../shared/teaching-session-state"
import type { TeachingPromptContext } from "../../../capabilities"
import type { LearnerSnapshot } from "../../../../learner-model"
export type { PromptRuntimeState } from "../../shared/teaching-session-state"

export type PromptBuildContext = {
  runtime: {
    directory: string
    profile: RuntimeProfile
    intentOverride?: TeachingIntentId
    activityBundle?: ActivityBundleCapability
  }
  learner: {
    snapshot: LearnerSnapshot
    focusGoalIds: string[]
  }
  workspace: {
    teachingContext?: TeachingPromptContext
  }
  previousState?: PromptRuntimeState
}
