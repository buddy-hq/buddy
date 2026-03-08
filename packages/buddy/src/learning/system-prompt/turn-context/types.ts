import { loadBundledActivitySkills } from "../../runtime/activity-skills.js"
import type {
  ActivityBundleCapability,
  LearnerPromptDigest,
  RuntimeProfile,
  TeachingIntentId,
} from "../../runtime/types.js"
import { TeachingService } from "../../teaching/service.js"
import type { TeachingPromptContext } from "../../teaching/types.js"

export type LoadedBundledSkills = Awaited<ReturnType<typeof loadBundledActivitySkills>>
export type TeachingCheckpointStatus = Awaited<ReturnType<typeof TeachingService.status>>

export type BuildTurnContextSectionsInput = {
  directory: string
  runtimeProfile: RuntimeProfile
  learnerDigest: LearnerPromptDigest
  teachingContext?: TeachingPromptContext
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
  userContent?: string
}

export type TurnAsyncData = {
  loadedSkills?: LoadedBundledSkills
  checkpointStatus?: TeachingCheckpointStatus
}
