import type {
  ActivityBundleCapability,
  RuntimeProfile,
  TeachingIntentId,
  WorkspaceState,
} from "../../runtime/types.js"
import type { TeachingPromptContext } from "../../teaching/types.js"
import { hasText, titleCaseFromKebab } from "../helpers.js"
import type { LoadedBundledSkills, TeachingCheckpointStatus } from "./types.js"

export function isCompletionClaim(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

export function summarizeDigest(lines: string[]): string {
  return lines
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.toLowerCase().includes("recommended next action:"))
    .join("\n")
}

export function buildWorkspaceStateText(profile: RuntimeProfile, workspaceState: WorkspaceState): string {
  const hasEditor = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const hasFigure = profile.capabilityEnvelope.visibleSurfaces.includes("figure")

  let guidance = "Teach through normal chat. Use learner state and project context to stay grounded."

  if (hasEditor) {
    guidance =
      workspaceState === "interactive"
        ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
        : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
  } else if (hasFigure) {
    guidance = "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
  }

  return `<workspace_state>
State: ${workspaceState}
${guidance}
</workspace_state>`
}

export function buildExplicitOverridesText(input: {
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
}): string {
  const focusGoals = input.focusGoalIds.length > 0 ? input.focusGoalIds.join(", ") : "none"
  const activityOverride = input.activityBundle ? `${input.activityBundle.label} (${input.activityBundle.id})` : "none"

  return `<explicit_overrides>
Intent override: ${input.intentOverride ?? "auto"}
Focus goals: ${focusGoals}
Activity bundle override: ${activityOverride}
</explicit_overrides>`
}

export function buildCapabilitySnapshotText(profile: RuntimeProfile): string {
  const directTools: string[] = []
  const activityTools: string[] = []
  const activitySkills: string[] = []
  const subagents: string[] = []

  for (const [toolId, access] of Object.entries(profile.capabilityEnvelope.tools)) {
    if (access !== "allow") continue
    if (toolId.startsWith("activity_")) {
      activityTools.push(toolId)
    } else {
      directTools.push(toolId)
    }
  }

  for (const [skillName, access] of Object.entries(profile.capabilityEnvelope.skills)) {
    if (access === "allow") {
      activitySkills.push(skillName)
    }
  }

  for (const [subagentId, access] of Object.entries(profile.capabilityEnvelope.subagents)) {
    if (access === "deny") continue
    subagents.push(access === "prefer" ? `${subagentId} (preferred)` : subagentId)
  }

  directTools.sort((a, b) => a.localeCompare(b))
  activityTools.sort((a, b) => a.localeCompare(b))
  activitySkills.sort((a, b) => a.localeCompare(b))
  subagents.sort((a, b) => a.localeCompare(b))

  return `<buddy_capability_snapshot>
This snapshot is authoritative for Buddy-managed teaching capabilities on this turn.
Direct Buddy tools: ${directTools.length > 0 ? directTools.join(", ") : "none"}
Activity tools: ${activityTools.length > 0 ? activityTools.join(", ") : "none"}
Activity skills: ${activitySkills.length > 0 ? activitySkills.join(", ") : "none"}
Subagents: ${subagents.length > 0 ? subagents.join(", ") : "none"}
Other globally installed skills may also exist through the native skill tool. Do not hide them, but do not confuse them with Buddy's teaching playbook.
</buddy_capability_snapshot>`
}

export function buildActivityCapabilitiesText(profile: RuntimeProfile, intentOverride?: TeachingIntentId): string {
  const lines = [
    "<activity_capabilities>",
    `Intent focus: ${intentOverride ?? "auto"}`,
  ]

  const bundles = profile.capabilityEnvelope.activityBundles
  if (bundles.length === 0) {
    lines.push("No first-class activity bundles are available for this persona and workspace state.")
    lines.push("</activity_capabilities>")
    return lines.join("\n")
  }

  for (const bundle of bundles) {
    lines.push(`- ${bundle.label} [${titleCaseFromKebab(bundle.intent)} | ${bundle.mode}] -> ${bundle.description}`)

    if (bundle.skills.length > 0) {
      lines.push(`  Skills (loadable via the native skill tool): ${bundle.skills.join(", ")}`)
    }

    if (bundle.tools.length > 0) {
      lines.push(`  Tools (vendor-callable this turn): ${bundle.tools.join(", ")}`)
    }

    if (bundle.subagents.length > 0) {
      lines.push(`  Subagents: ${bundle.subagents.join(", ")}`)
    }

    if (bundle.whenToUse.length > 0) {
      lines.push(`  Use when: ${bundle.whenToUse[0]}`)
    }
  }

  lines.push("</activity_capabilities>")
  return lines.join("\n")
}

export function buildSelectedActivityText(input: {
  activityBundle: ActivityBundleCapability
  loadedSkills: LoadedBundledSkills
}): string {
  const lines = [
    "<selected_activity_bundle>",
    "This bundle was explicitly selected for the next reply. Treat it as the primary teaching procedure for this turn unless the learner's actual message clearly conflicts.",
    `Selected bundle: ${input.activityBundle.label} (${input.activityBundle.id})`,
    `Intent: ${input.activityBundle.intent}`,
    `Mode: ${input.activityBundle.mode}`,
    `Description: ${input.activityBundle.description}`,
  ]

  if (input.activityBundle.tools.length > 0) {
    lines.push(`Tool hooks: ${input.activityBundle.tools.join(", ")}`)
    lines.push("If one of these tools can generate a structured artifact for the activity, prefer using it instead of improvising the artifact from scratch.")
  }

  if (input.activityBundle.subagents.length > 0) {
    lines.push(`Helper hooks: ${input.activityBundle.subagents.join(", ")}`)
  }

  if (input.activityBundle.whenToUse.length > 0) {
    lines.push(`Use when: ${input.activityBundle.whenToUse.join(" | ")}`)
  }

  for (const skill of input.loadedSkills) {
    lines.push("")
    lines.push(`<activity_skill name="${skill.name}">`)

    if (hasText(skill.description)) {
      lines.push(`Description: ${skill.description}`)
      lines.push("")
    }

    lines.push(skill.content)
    lines.push("</activity_skill>")
  }

  lines.push("</selected_activity_bundle>")
  return lines.join("\n")
}

export function buildTeachingWorkspaceText(input: {
  context: TeachingPromptContext
  checkpointStatus?: TeachingCheckpointStatus
}): string {
  const lines = [
    "<teaching_workspace>",
    `Session: ${input.context.sessionID}`,
    `Lesson file: ${input.context.lessonFilePath}`,
    `Checkpoint file: ${input.context.checkpointFilePath}`,
    `Language: ${input.context.language}`,
    `Revision: ${input.context.revision}`,
  ]

  if (input.checkpointStatus) {
    lines.push(
      `Checkpoint status: ${input.checkpointStatus.changedSinceLastCheckpoint ? "pending acceptance" : "accepted"}`,
    )
  }

  if (input.checkpointStatus?.trackedFiles.length) {
    lines.push("Tracked files:")
    for (const file of input.checkpointStatus.trackedFiles) {
      lines.push(`- ${file}`)
    }
  }

  if (
    input.context.selectionStartLine &&
    input.context.selectionStartColumn &&
    input.context.selectionEndLine &&
    input.context.selectionEndColumn
  ) {
    lines.push(
      `Selection: L${input.context.selectionStartLine}:C${input.context.selectionStartColumn}-L${input.context.selectionEndLine}:C${input.context.selectionEndColumn}`,
    )
  }

  lines.push("Treat the lesson file as the shared teaching surface when editor tools are available.")
  lines.push("</teaching_workspace>")

  return lines.join("\n")
}

export function buildTurnCautionsText(input: {
  completionClaim: boolean
  changedSinceCheckpoint?: boolean
  hasEditor: boolean
}): string {
  const lines = ["<turn_cautions>"]

  if (input.completionClaim) {
    lines.push("The learner's latest message sounds like a completion claim. Verify before advancing.")
  }

  if (input.changedSinceCheckpoint) {
    lines.push("There are unaccepted changes since the last teaching checkpoint.")
  }

  if (input.hasEditor && !input.changedSinceCheckpoint) {
    lines.push("If you accept the current lesson state, checkpoint it only after verifying the learner's work.")
  }

  lines.push("</turn_cautions>")
  return lines.join("\n")
}
