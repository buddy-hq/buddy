import type { WorkspaceState } from "../../../capabilities/types"
import { loadBundledActivitySkills } from "../../../../agents/curriculum"
import { TeachingService } from "../../../../agents/capabilities"
import { createPromptSection, hasText } from "../helpers"
import type { RuntimePromptSection } from "../types"
import {
  buildActivityCapabilitiesText,
  buildCapabilitySnapshotText,
  buildExplicitOverridesText,
  buildSelectedActivityText,
  buildTeachingWorkspaceText,
  buildTurnCautionsText,
  buildWorkspaceStateText,
  isCompletionClaim,
  summarizeDigest,
} from "./text"
import type { BuildTurnContextSectionsInput } from "./types"

async function loadTurnContextAsyncData(input: BuildTurnContextSectionsInput) {
  const hasEditor = input.runtimeProfile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const loadSkillsPromise = input.activityBundle
    ? loadBundledActivitySkills(input.activityBundle.skills)
    : Promise.resolve(undefined)
  const checkpointStatusPromise = input.teachingContext?.active && hasEditor
    ? TeachingService.status(input.directory, input.teachingContext.sessionID).catch(() => undefined)
    : Promise.resolve(undefined)
  const [loadedSkills, checkpointStatus] = await Promise.all([loadSkillsPromise, checkpointStatusPromise])
  return {
    loadedSkills,
    checkpointStatus,
  }
}

export async function buildTurnContextSections(
  input: BuildTurnContextSectionsInput,
): Promise<RuntimePromptSection[]> {
  const sections: RuntimePromptSection[] = []
  const workspaceState: WorkspaceState = input.teachingContext?.active ? "interactive" : "chat"
  const hasEditor = input.runtimeProfile.capabilityEnvelope.visibleSurfaces.includes("editor")

  sections.push(
    createPromptSection("workspace-state", "Workspace State", buildWorkspaceStateText(input.runtimeProfile, workspaceState)),
  )

  sections.push(
    createPromptSection(
      "explicit-overrides",
      "Explicit Overrides",
      buildExplicitOverridesText({
        intentOverride: input.intentOverride,
        focusGoalIds: input.focusGoalIds,
        activityBundle: input.activityBundle,
      }),
    ),
  )

  sections.push(
    createPromptSection("buddy-capabilities", "Buddy Capability Snapshot", buildCapabilitySnapshotText(input.runtimeProfile)),
  )

  sections.push(
    createPromptSection(
      "activity-capabilities",
      "Activity Capabilities",
      buildActivityCapabilitiesText(input.runtimeProfile, input.intentOverride),
    ),
  )

  sections.push(
    createPromptSection("learner-summary", "Learner Summary", summarizeDigest(input.learnerDigest.tier1)),
  )

  const progressSummary = summarizeDigest(input.learnerDigest.tier2)
  if (hasText(progressSummary)) {
    sections.push(createPromptSection("progress-summary", "Progress Summary", progressSummary))
  }

  const feedbackSummary = summarizeDigest(input.learnerDigest.tier3)
  if (hasText(feedbackSummary)) {
    sections.push(createPromptSection("feedback-summary", "Feedback Summary", feedbackSummary))
  }

  const { loadedSkills, checkpointStatus } = await loadTurnContextAsyncData(input)

  if (input.activityBundle && loadedSkills) {
    sections.push(
      createPromptSection(
        "selected-activity",
        "Selected Activity Bundle",
        buildSelectedActivityText({
          activityBundle: input.activityBundle,
          loadedSkills,
        }),
      ),
    )
  }

  if (input.teachingContext?.active && hasEditor) {
    sections.push(
      createPromptSection(
        "teaching-workspace",
        "Teaching Workspace",
        buildTeachingWorkspaceText({
          context: input.teachingContext,
          checkpointStatus,
        }),
      ),
    )
  }

  sections.push(
    createPromptSection(
      "turn-cautions",
      "Turn Cautions",
      buildTurnCautionsText({
        completionClaim: isCompletionClaim(input.userContent ?? ""),
        changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        hasEditor,
      }),
    ),
  )

  return sections
}
