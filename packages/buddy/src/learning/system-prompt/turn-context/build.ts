import type { WorkspaceState } from "../../runtime/types.js"
import { createPromptSection, hasText } from "../helpers.js"
import type { RuntimePromptSection } from "../types.js"
import { loadTurnAsyncData } from "./async-data.js"
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
} from "./text.js"
import type { BuildTurnContextSectionsInput } from "./types.js"

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

  const { loadedSkills, checkpointStatus } = await loadTurnAsyncData(input)

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
