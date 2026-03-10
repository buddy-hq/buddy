import type {
  ActivityBundleCapability,
  RuntimeProfile,
  Intent,
} from "../../runtime/types"
import type { PromptRuntimeState } from "../../shared/teaching-session-state"
import type { TeachingPromptContext } from "../../../capabilities"
import type { LearnerSnapshot } from "../../../../learner-model"
export type { PromptRuntimeState } from "../../shared/teaching-session-state"

export type PromptBuildContext = {
  runtime: {
    directory: string
    profile: RuntimeProfile
    intentOverride?: Intent
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
