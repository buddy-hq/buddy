import type {
  ActivityBundleCapability,
  RuntimeProfile,
  TeachingIntentId,
  WorkspaceState,
} from "../../runtime/types"
import type { TeachingPromptContext } from "../../../capabilities"

export type PromptRuntimeState = {
  persona: string
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
}

export type PromptBuildContext = {
  runtime: {
    directory: string
    profile: RuntimeProfile
    intentOverride?: TeachingIntentId
    activityBundle?: ActivityBundleCapability
  }
  learner: {
    digest: {
      tier1: string[]
      tier2: string[]
      tier3: string[]
    }
    focusGoalIds: string[]
    userContent?: string
  }
  workspace: {
    teachingContext?: TeachingPromptContext
  }
  previousState?: PromptRuntimeState
}
