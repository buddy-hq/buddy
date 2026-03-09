import type {
  ActivityBundleCapability,
  RuntimeProfile,
  TeachingIntentId,
  WorkspaceState,
} from "../../runtime/types"
import type { LoadedActivitySkill } from "../../../curriculum"
import type { TeachingPromptContext } from "../../../capabilities"
import RAW_TEACHING_POLICY_PROMPT from "./teaching-workspace-policy.p.md"
import type { PromptBuildContext } from "./prompt-build-context"

type ReminderSignals = {
  completionClaim: boolean
  changedSinceCheckpoint?: boolean
}

export type SystemContextBuild = {
  systemContext: string
  reminderSignals: ReminderSignals
}

type RuntimeContextBuild = {
  runtimeContext: string
  reminderSignals: ReminderSignals
}

function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function titleCaseFromKebab(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function isCompletionClaim(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

function summarizeDigest(lines: string[]): string {
  return lines
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.toLowerCase().includes("recommended next action:"))
    .join("\n")
}

function buildStableHeader(profile: RuntimeProfile): string {
  const teachingWorkspacePolicy = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
    ? `\n\n${RAW_TEACHING_POLICY_PROMPT.trim()}`
    : ""

  return `<buddy_runtime_header>
Persona: ${profile.persona}
Runtime agent: ${profile.runtimeAgent}
The learner may optionally steer the session with an explicit intent override, but the teacher agent decides the pedagogical flow from conversation history, learner state, and available tools.
Sidebar suggestions are advisory learner-facing shortcuts. Treat them as agent input only when the learner explicitly clicks or sends one.
First-class activity bundles may expose skills, tools, and subagents. Load a skill only when you want its full procedure; do not call skills as a formality.
When the learner asks which Buddy teaching skills or tools are available, answer from the current activity capabilities and runtime permissions first. Other globally installed skills may also exist, but they are not the Buddy teaching playbook.
</buddy_runtime_header>

<teaching_principles>
Use explanation to unlock progress, practice to create evidence, and checks to verify understanding.
Do not wait for backend routing. Decide live from the learner's message, the history, and the current learner state.
Use the learner store and workspace context when they materially improve the answer.
</teaching_principles>

<tooling_guidance>
Available surfaces: ${profile.capabilityEnvelope.visibleSurfaces.join(", ") || "chat"}
Tool permissions are authoritative. Use persona-specific tools and subagents when they are available, but do not assume unavailable capabilities exist.
Optional activity capabilities should do real work such as generating practice, generating checks, or mutating the lesson workspace; do not treat them as a hidden routing layer.
</tooling_guidance>${teachingWorkspacePolicy}`
}

function buildWorkspaceStateText(profile: RuntimeProfile, workspaceState: WorkspaceState): string {
  const hasEditor = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const hasFigure = profile.capabilityEnvelope.visibleSurfaces.includes("figure")

  const guidance = hasEditor
    ? workspaceState === "interactive"
      ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
      : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
    : hasFigure
      ? "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
      : "Teach through normal chat. Use learner state and project context to stay grounded."

  return `<workspace_state>
State: ${workspaceState}
${guidance}
</workspace_state>`
}

function buildExplicitOverridesText(input: {
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

function buildCapabilitySnapshotText(profile: RuntimeProfile): string {
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
    .map(([subagentId, access]) => (access === "prefer" ? `${subagentId} (preferred)` : subagentId))
    .sort((left, right) => left.localeCompare(right))

  return `<buddy_capability_snapshot>
This snapshot is authoritative for Buddy-managed teaching capabilities on this turn.
Direct Buddy tools: ${directTools.length > 0 ? directTools.join(", ") : "none"}
Activity tools: ${activityTools.length > 0 ? activityTools.join(", ") : "none"}
Activity skills: ${activitySkills.length > 0 ? activitySkills.join(", ") : "none"}
Subagents: ${subagents.length > 0 ? subagents.join(", ") : "none"}
Other globally installed skills may also exist through the native skill tool. Do not hide them, but do not confuse them with Buddy's teaching playbook.
</buddy_capability_snapshot>`
}

function buildActivityCapabilitiesText(profile: RuntimeProfile, intentOverride?: TeachingIntentId): string {
  const bundles = profile.capabilityEnvelope.activityBundles
  if (bundles.length === 0) {
    return `<activity_capabilities>
Intent focus: ${intentOverride ?? "auto"}
No first-class activity bundles are available for this persona and workspace state.
</activity_capabilities>`
  }

  const bundleText = bundles
    .map((bundle) => {
      const skills = bundle.skills.length > 0 ? `\n  Skills (loadable via the native skill tool): ${bundle.skills.join(", ")}` : ""
      const tools = bundle.tools.length > 0 ? `\n  Tools (vendor-callable this turn): ${bundle.tools.join(", ")}` : ""
      const subagents = bundle.subagents.length > 0 ? `\n  Subagents: ${bundle.subagents.join(", ")}` : ""
      const whenToUse = bundle.whenToUse.length > 0 ? `\n  Use when: ${bundle.whenToUse[0]}` : ""
      return `- ${bundle.label} [${titleCaseFromKebab(bundle.intent)} | ${bundle.mode}] -> ${bundle.description}${skills}${tools}${subagents}${whenToUse}`
    })
    .join("\n")

  return `<activity_capabilities>
Intent focus: ${intentOverride ?? "auto"}
${bundleText}
</activity_capabilities>`
}

function buildSelectedActivityText(input: {
  activityBundle: ActivityBundleCapability
  loadedSkills: LoadedActivitySkill[]
}): string {
  const toolHooks =
    input.activityBundle.tools.length > 0
      ? `\nTool hooks: ${input.activityBundle.tools.join(", ")}\nIf one of these tools can generate a structured artifact for the activity, prefer using it instead of improvising the artifact from scratch.`
      : ""

  const helperHooks =
    input.activityBundle.subagents.length > 0 ? `\nHelper hooks: ${input.activityBundle.subagents.join(", ")}` : ""

  const useWhen =
    input.activityBundle.whenToUse.length > 0 ? `\nUse when: ${input.activityBundle.whenToUse.join(" | ")}` : ""

  const skillsText = input.loadedSkills
    .map((skill) => {
      const description = hasText(skill.description) ? `Description: ${skill.description}\n\n` : ""
      return `<activity_skill name="${skill.name}">\n${description}${skill.content}\n</activity_skill>`
    })
    .join("\n\n")

  return `<selected_activity_bundle>
This bundle was explicitly selected for the next reply. Treat it as the primary teaching procedure for this turn unless the learner's actual message clearly conflicts.
Selected bundle: ${input.activityBundle.label} (${input.activityBundle.id})
Intent: ${input.activityBundle.intent}
Mode: ${input.activityBundle.mode}
Description: ${input.activityBundle.description}${toolHooks}${helperHooks}${useWhen}${skillsText ? `\n\n${skillsText}` : ""}
</selected_activity_bundle>`
}

type TeachingCheckpointStatus = {
  revision: number
  lessonFilePath: string
  checkpointFilePath: string
  changedSinceLastCheckpoint: boolean
  trackedFiles: string[]
}

function buildTeachingWorkspaceText(input: {
  context: TeachingPromptContext
  checkpointStatus?: TeachingCheckpointStatus
}): string {
  const checkpointStatus = input.checkpointStatus
    ? `\nCheckpoint status: ${input.checkpointStatus.changedSinceLastCheckpoint ? "pending acceptance" : "accepted"}`
    : ""

  const trackedFiles =
    input.checkpointStatus?.trackedFiles.length
      ? `\nTracked files:\n${input.checkpointStatus.trackedFiles.map((file) => `- ${file}`).join("\n")}`
      : ""

  const selection =
    input.context.selectionStartLine &&
    input.context.selectionStartColumn &&
    input.context.selectionEndLine &&
    input.context.selectionEndColumn
      ? `\nSelection: L${input.context.selectionStartLine}:C${input.context.selectionStartColumn}-L${input.context.selectionEndLine}:C${input.context.selectionEndColumn}`
      : ""

  return `<teaching_workspace>
Session: ${input.context.sessionID}
Lesson file: ${input.context.lessonFilePath}
Checkpoint file: ${input.context.checkpointFilePath}
Language: ${input.context.language}
Revision: ${input.context.revision}${checkpointStatus}${trackedFiles}${selection}
Treat the lesson file as the shared teaching surface when editor tools are available.
</teaching_workspace>`
}

async function loadBundledActivitySkills(skills: string[]) {
  const { loadBundledActivitySkills: load } = await import("../../../curriculum")
  return load(skills)
}

async function getCheckpointStatus(directory: string, sessionID: string) {
  const { TeachingService } = await import("../../../capabilities")
  return TeachingService.status(directory, sessionID).catch(() => undefined)
}

async function buildRuntimeContext(input: PromptBuildContext): Promise<RuntimeContextBuild> {
  const workspaceState: WorkspaceState = input.workspace.teachingContext?.active ? "interactive" : "chat"
  const hasEditor = input.runtime.profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const progressSummary = summarizeDigest(input.learner.digest.tier2)
  const feedbackSummary = summarizeDigest(input.learner.digest.tier3)

  const loadSkillsPromise = input.runtime.activityBundle
    ? loadBundledActivitySkills(input.runtime.activityBundle.skills)
    : Promise.resolve(undefined)

  const checkpointStatusPromise =
    input.workspace.teachingContext?.active && hasEditor
      ? getCheckpointStatus(input.runtime.directory, input.workspace.teachingContext.sessionID)
      : Promise.resolve(undefined)

  const [loadedSkills, checkpointStatus] = await Promise.all([loadSkillsPromise, checkpointStatusPromise])

  const runtimeSections = [
    `Workspace State:\n${buildWorkspaceStateText(input.runtime.profile, workspaceState)}`,
    `Explicit Overrides:\n${buildExplicitOverridesText({
      intentOverride: input.runtime.intentOverride,
      focusGoalIds: input.learner.focusGoalIds,
      activityBundle: input.runtime.activityBundle,
    })}`,
    `Buddy Capability Snapshot:\n${buildCapabilitySnapshotText(input.runtime.profile)}`,
    `Activity Capabilities:\n${buildActivityCapabilitiesText(input.runtime.profile, input.runtime.intentOverride)}`,
    `Learner Summary:\n${summarizeDigest(input.learner.digest.tier1)}`,
    hasText(progressSummary) ? `Progress Summary:\n${progressSummary}` : undefined,
    hasText(feedbackSummary) ? `Feedback Summary:\n${feedbackSummary}` : undefined,
    input.runtime.activityBundle && loadedSkills
      ? `Selected Activity Bundle:\n${buildSelectedActivityText({
          activityBundle: input.runtime.activityBundle,
          loadedSkills,
        })}`
      : undefined,
    input.workspace.teachingContext?.active && hasEditor
      ? `Teaching Workspace:\n${buildTeachingWorkspaceText({
          context: input.workspace.teachingContext,
          checkpointStatus,
        })}`
      : undefined,
  ]
    .filter(hasText)
    .join("\n\n")

  return {
    runtimeContext: `<buddy_runtime_context>\n\n${runtimeSections}\n\n</buddy_runtime_context>`,
    reminderSignals: {
      completionClaim: isCompletionClaim(input.learner.userContent ?? ""),
      changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
    },
  }
}

export async function buildSystemContext(input: PromptBuildContext): Promise<SystemContextBuild> {
  const stableHeader = buildStableHeader(input.runtime.profile)
  const runtimeContext = await buildRuntimeContext(input)

  return {
    systemContext: [stableHeader, runtimeContext.runtimeContext].filter(Boolean).join("\n\n"),
    reminderSignals: runtimeContext.reminderSignals,
  }
}
