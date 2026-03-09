import type {
  ActivityBundleCapability,
  LearnerPromptDigest,
  RuntimeProfile,
  TeachingIntentId,
} from "../../../capabilities/types"
import type { LoadedActivitySkill } from "../../../../agents/curriculum"
import type { TeachingPromptContext } from "../../../../agents/capabilities"

export type LoadedBundledSkills = LoadedActivitySkill[]

export type TeachingCheckpointStatus = {
  revision: number
  lessonFilePath: string
  checkpointFilePath: string
  changedSinceLastCheckpoint: boolean
  trackedFiles: string[]
}

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
