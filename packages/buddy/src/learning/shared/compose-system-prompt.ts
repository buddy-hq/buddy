import type { ActivityBundleCapability, LearningPromptBuild, RuntimeProfile, RuntimePromptSection, WorkspaceState } from "../runtime/types.js"
import type { TeachingIntentId } from "../runtime/types.js"
import type { LearnerPromptDigest } from "../runtime/types.js"
import { loadBundledActivitySkills } from "../runtime/activity-skills.js"
import type { TeachingPromptContext } from "../teaching/types.js"
import { TeachingService } from "../teaching/service.js"
import RAW_TEACHING_POLICY_PROMPT from "../teaching/teaching-policy.p.md"

function isCompletionClaim(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

function titleCase(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatStableHeader(profile: RuntimeProfile): RuntimePromptSection[] {
  const sections: RuntimePromptSection[] = [
    {
      kind: "persona-header",
      label: "Persona Header",
      text: [
        "<buddy_runtime_header>",
        `Persona: ${profile.persona}`,
        `Runtime agent: ${profile.runtimeAgent}`,
        "The learner may optionally steer the session with an explicit intent override, but the teacher agent decides the pedagogical flow from conversation history, learner state, and available tools.",
        "Sidebar suggestions are advisory learner-facing shortcuts. Treat them as agent input only when the learner explicitly clicks or sends one.",
        "First-class activity bundles may expose skills, tools, and subagents. Load a skill only when you want its full procedure; do not call skills as a formality.",
        "When the learner asks which Buddy teaching skills or tools are available, answer from the current activity capabilities and runtime permissions first. Other globally installed skills may also exist, but they are not the Buddy teaching playbook.",
        "</buddy_runtime_header>",
      ].join("\n"),
    },
    {
      kind: "teaching-principles",
      label: "Teaching Principles",
      text: [
        "<teaching_principles>",
        "Use explanation to unlock progress, practice to create evidence, and checks to verify understanding.",
        "Do not wait for backend routing. Decide live from the learner's message, the history, and the current learner state.",
        "Use the learner store and workspace context when they materially improve the answer.",
        "</teaching_principles>",
      ].join("\n"),
    },
    {
      kind: "tooling-guidance",
      label: "Tooling Guidance",
      text: [
        "<tooling_guidance>",
        `Available surfaces: ${profile.capabilityEnvelope.visibleSurfaces.join(", ") || "chat"}`,
        "Tool permissions are authoritative. Use persona-specific tools and subagents when they are available, but do not assume unavailable capabilities exist.",
        "Optional activity capabilities should do real work such as generating practice, generating checks, or mutating the lesson workspace; do not treat them as a hidden routing layer.",
        "</tooling_guidance>",
      ].join("\n"),
    },
  ]

  if (profile.capabilityEnvelope.visibleSurfaces.includes("editor")) {
    sections.push({
      kind: "tooling-guidance",
      label: "Teaching Workspace Policy",
      text: RAW_TEACHING_POLICY_PROMPT.trim(),
    })
  }

  return sections
}

function formatWorkspaceState(input: { workspaceState: WorkspaceState; profile: RuntimeProfile }) {
  const supportsEditor = input.profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const supportsFigure = input.profile.capabilityEnvelope.visibleSurfaces.includes("figure")

  return [
    "<workspace_state>",
    `State: ${input.workspaceState}`,
    supportsEditor
      ? input.workspaceState === "interactive"
        ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
        : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
      : supportsFigure
        ? "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
        : "Teach through normal chat. Use learner state and project context to stay grounded.",
    "</workspace_state>",
  ].join("\n")
}

function formatOverrides(input: {
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
}) {
  const lines = ["<explicit_overrides>"]
  lines.push(`Intent override: ${input.intentOverride ?? "auto"}`)
  lines.push(`Focus goals: ${input.focusGoalIds.length > 0 ? input.focusGoalIds.join(", ") : "none"}`)
  lines.push(`Activity bundle override: ${input.activityBundle ? `${input.activityBundle.label} (${input.activityBundle.id})` : "none"}`)
  lines.push("</explicit_overrides>")
  return lines.join("\n")
}

function formatLearnerSummary(lines: string[]) {
  return lines
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.toLowerCase().includes("recommended next action:"))
    .join("\n")
}

function formatActivityCapabilities(input: {
  profile: RuntimeProfile
  intentOverride?: TeachingIntentId
}) {
  const bundles = input.profile.capabilityEnvelope.activityBundles
  const lines = ["<activity_capabilities>"]
  lines.push(`Intent focus: ${input.intentOverride ?? "auto"}`)

  if (bundles.length === 0) {
    lines.push("No first-class activity bundles are available for this persona and workspace state.")
    lines.push("</activity_capabilities>")
    return lines.join("\n")
  }

  for (const bundle of bundles) {
    lines.push(
      `- ${bundle.label} [${titleCase(bundle.intent)} | ${bundle.mode}] -> ${bundle.description}`,
    )

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

function formatBuddyCapabilitySnapshot(profile: RuntimeProfile) {
  const directTools = Object.entries(profile.capabilityEnvelope.tools)
    .filter(([, access]) => access === "allow")
    .map(([toolId]) => toolId)
    .filter((toolId) => !toolId.startsWith("activity_"))
    .sort((left, right) => left.localeCompare(right))
  const activityTools = Object.entries(profile.capabilityEnvelope.tools)
    .filter(([, access]) => access === "allow")
    .map(([toolId]) => toolId)
    .filter((toolId) => toolId.startsWith("activity_"))
    .sort((left, right) => left.localeCompare(right))
  const activitySkills = Object.entries(profile.capabilityEnvelope.skills)
    .filter(([, access]) => access === "allow")
    .map(([skillName]) => skillName)
    .sort((left, right) => left.localeCompare(right))
  const subagents = Object.entries(profile.capabilityEnvelope.subagents)
    .filter(([, access]) => access !== "deny")
    .map(([subagentId, access]) => `${subagentId}${access === "prefer" ? " (preferred)" : ""}`)
    .sort((left, right) => left.localeCompare(right))

  const lines = [
    "<buddy_capability_snapshot>",
    "This snapshot is authoritative for Buddy-managed teaching capabilities on this turn.",
  ]

  lines.push(`Direct Buddy tools: ${directTools.length > 0 ? directTools.join(", ") : "none"}`)
  lines.push(`Activity tools: ${activityTools.length > 0 ? activityTools.join(", ") : "none"}`)
  lines.push(`Activity skills: ${activitySkills.length > 0 ? activitySkills.join(", ") : "none"}`)
  lines.push(`Subagents: ${subagents.length > 0 ? subagents.join(", ") : "none"}`)
  lines.push(
    "Other globally installed skills may also exist through the native skill tool. Do not hide them, but do not confuse them with Buddy's teaching playbook.",
  )
  lines.push("</buddy_capability_snapshot>")

  return lines.join("\n")
}

function formatSelectedActivity(input: {
  activityBundle: ActivityBundleCapability
  loadedSkills: Awaited<ReturnType<typeof loadBundledActivitySkills>>
}) {
  const lines = ["<selected_activity_bundle>"]
  lines.push("This bundle was explicitly selected for the next reply. Treat it as the primary teaching procedure for this turn unless the learner's actual message clearly conflicts.")
  lines.push(`Selected bundle: ${input.activityBundle.label} (${input.activityBundle.id})`)
  lines.push(`Intent: ${input.activityBundle.intent}`)
  lines.push(`Mode: ${input.activityBundle.mode}`)
  lines.push(`Description: ${input.activityBundle.description}`)

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
    if (skill.description) {
      lines.push(`Description: ${skill.description}`)
      lines.push("")
    }
    lines.push(skill.content)
    lines.push("</activity_skill>")
  }

  lines.push("</selected_activity_bundle>")
  return lines.join("\n")
}

function formatTeachingPromptContext(
  input: TeachingPromptContext & {
    changedSinceCheckpoint?: boolean
    trackedFiles?: string[]
  },
): string {
  const parts = [
    "<teaching_workspace>",
    `Session: ${input.sessionID}`,
    `Lesson file: ${input.lessonFilePath}`,
    `Checkpoint file: ${input.checkpointFilePath}`,
    `Language: ${input.language}`,
    `Revision: ${input.revision}`,
  ]

  if (typeof input.changedSinceCheckpoint === "boolean") {
    parts.push(`Checkpoint status: ${input.changedSinceCheckpoint ? "pending acceptance" : "accepted"}`)
  }

  if (input.trackedFiles && input.trackedFiles.length > 0) {
    parts.push("Tracked files:")
    for (const file of input.trackedFiles) {
      parts.push(`- ${file}`)
    }
  }

  if (input.selectionStartLine && input.selectionStartColumn && input.selectionEndLine && input.selectionEndColumn) {
    parts.push(
      `Selection: L${input.selectionStartLine}:C${input.selectionStartColumn}-L${input.selectionEndLine}:C${input.selectionEndColumn}`,
    )
  }

  parts.push("Treat the lesson file as the shared teaching surface when editor tools are available.")
  parts.push("</teaching_workspace>")
  return parts.join("\n")
}

function formatTurnCautions(input: {
  completionClaim: boolean
  changedSinceCheckpoint?: boolean
  profile: RuntimeProfile
}) {
  const lines = ["<turn_cautions>"]

  if (input.completionClaim) {
    lines.push("The learner's latest message sounds like a completion claim. Verify before advancing.")
  }

  if (input.changedSinceCheckpoint) {
    lines.push("There are unaccepted changes since the last teaching checkpoint.")
  }

  if (input.profile.capabilityEnvelope.visibleSurfaces.includes("editor") && !input.changedSinceCheckpoint) {
    lines.push("If you accept the current lesson state, checkpoint it only after verifying the learner's work.")
  }

  lines.push("</turn_cautions>")
  return lines.join("\n")
}

export async function buildLearningSystemPrompt(input: {
  directory: string
  runtimeProfile: RuntimeProfile
  learnerDigest: LearnerPromptDigest
  teachingContext?: TeachingPromptContext
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
  userContent?: string
}): Promise<LearningPromptBuild> {
  const workspaceState: WorkspaceState = input.teachingContext?.active ? "interactive" : "chat"
  const stableHeaderSections = formatStableHeader(input.runtimeProfile)
  const turnContextSections: RuntimePromptSection[] = [
    {
      kind: "workspace-state",
      label: "Workspace State",
      text: formatWorkspaceState({ workspaceState, profile: input.runtimeProfile }),
    },
    {
      kind: "explicit-overrides",
      label: "Explicit Overrides",
      text: formatOverrides({
        intentOverride: input.intentOverride,
        focusGoalIds: input.focusGoalIds,
        activityBundle: input.activityBundle,
      }),
    },
    {
      kind: "buddy-capabilities",
      label: "Buddy Capability Snapshot",
      text: formatBuddyCapabilitySnapshot(input.runtimeProfile),
    },
    {
      kind: "activity-capabilities",
      label: "Activity Capabilities",
      text: formatActivityCapabilities({
        profile: input.runtimeProfile,
        intentOverride: input.intentOverride,
      }),
    },
    {
      kind: "learner-summary",
      label: "Learner Summary",
      text: formatLearnerSummary(input.learnerDigest.tier1),
    },
  ]

  if (input.activityBundle) {
    const loadedSkills = await loadBundledActivitySkills(input.activityBundle.skills)
    turnContextSections.push({
      kind: "selected-activity",
      label: "Selected Activity Bundle",
      text: formatSelectedActivity({
        activityBundle: input.activityBundle,
        loadedSkills,
      }),
    })
  }

  const progressSummary = formatLearnerSummary(input.learnerDigest.tier2)
  if (progressSummary) {
    turnContextSections.push({
      kind: "progress-summary",
      label: "Progress Summary",
      text: progressSummary,
    })
  }

  const feedbackSummary = formatLearnerSummary(input.learnerDigest.tier3)
  if (feedbackSummary) {
    turnContextSections.push({
      kind: "feedback-summary",
      label: "Feedback Summary",
      text: feedbackSummary,
    })
  }

  let checkpointStatus:
    | {
        changedSinceLastCheckpoint: boolean
        trackedFiles: string[]
      }
    | undefined

  if (input.teachingContext?.active && input.runtimeProfile.capabilityEnvelope.visibleSurfaces.includes("editor")) {
    checkpointStatus = await TeachingService.status(input.directory, input.teachingContext.sessionID).catch(() => undefined)

    turnContextSections.push({
      kind: "teaching-workspace",
      label: "Teaching Workspace",
      text: formatTeachingPromptContext({
        ...input.teachingContext,
        changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        trackedFiles: checkpointStatus?.trackedFiles,
      }),
    })
  }

  const turnCautions = formatTurnCautions({
    completionClaim: isCompletionClaim(input.userContent ?? ""),
    changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
    profile: input.runtimeProfile,
  })
  turnContextSections.push({
    kind: "turn-cautions",
    label: "Turn Cautions",
    text: turnCautions,
  })

  return {
    stableHeader: stableHeaderSections.map((section) => section.text).join("\n\n").trim(),
    turnContext: [
      "<buddy_turn_context>",
      ...turnContextSections.map((section) => `${section.label}:\n${section.text}`),
      "</buddy_turn_context>",
    ].join("\n\n").trim(),
    stableHeaderSections,
    turnContextSections,
  }
}

export async function composeLearningSystemPrompt(input: {
  directory: string
  runtimeProfile: RuntimeProfile
  learnerDigest: LearnerPromptDigest
  teachingContext?: TeachingPromptContext
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
  userContent?: string
}): Promise<string> {
  const prompt = await buildLearningSystemPrompt(input)
  return [prompt.stableHeader, prompt.turnContext].filter(Boolean).join("\n\n")
}

export function summarizeAdvisorySuggestions(input: {
  recommendedNextAction: string
  openFeedbackActions: string[]
  relevantGoalIds: string[]
}) {
  const suggestions = [] as string[]

  if (input.relevantGoalIds.length > 0) {
    suggestions.push(`Focus goals: ${input.relevantGoalIds.join(", ")}`)
  }

  suggestions.push(`Suggested next action for the learner UI: ${titleCase(input.recommendedNextAction)}`)

  for (const action of input.openFeedbackActions.slice(0, 2)) {
    suggestions.push(`Resolve feedback: ${action}`)
  }

  return suggestions
}
