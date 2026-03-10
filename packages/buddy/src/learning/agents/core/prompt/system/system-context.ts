import type { ActivityBundleCapability, RuntimeProfile, TeachingIntentId, WorkspaceState } from "../../runtime/types"
import { hasText } from "../../shared/text"
import type { LoadedActivitySkill } from "../../../curriculum"
import type { TeachingPromptContext } from "../../../capabilities"
import RAW_TEACHING_POLICY_PROMPT from "./teaching-workspace-policy.p.md"
import type { PromptBuildContext } from "./prompt-build-context"

export type SystemContextBuild = {
  systemContext: string
  changedSinceCheckpoint?: boolean
}

type LearnerSnapshotContext = PromptBuildContext["learner"]["snapshot"]

type TeachingCheckpointStatus = {
  changedSinceLastCheckpoint: boolean
  trackedFiles: string[]
}

type RuntimeContextBuild = {
  runtimeContext: string
  changedSinceCheckpoint?: boolean
}

function compactLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function titleCaseFromKebab(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function sortValues(values: string[]) {
  return values.sort((left, right) => left.localeCompare(right))
}

function collectPermissionKeys<TAccess extends string>(input: {
  permissions: Record<string, TAccess>
  includes: (access: TAccess) => boolean
  map?: (entry: { id: string; access: TAccess }) => string
}): string[] {
  return sortValues(
    Object.entries(input.permissions)
      .filter(([, access]) => input.includes(access))
      .map(([id, access]) => (input.map ? input.map({ id, access }) : id)),
  )
}

function buildLearnerSummaryText(snapshot: LearnerSnapshotContext): string {
  const relevantGoalIds = snapshot.goals.map((goal) => goal.id)
  const goalLines = snapshot.goals.slice(0, 6).map((goal) => `- ${goal.statement} [test: ${goal.howToTest}]`)
  const constraintLines = snapshot.constraintsSummary.map((line) => `- Constraint: ${compactLine(line)}`)

  return [
    "<learner_state>",
    `Workspace: ${snapshot.workspace.label}`,
    relevantGoalIds.length > 0
      ? `Relevant goals: ${relevantGoalIds.join(", ")}`
      : "No relevant goals exist yet. Define goals before sequencing practice.",
    ...goalLines,
    ...constraintLines,
    "</learner_state>",
  ].join("\n")
}

function buildLearnerContextSections(snapshot: LearnerSnapshotContext): {
  learnerSummary: string
  learnerProgress: string
  learnerFeedback: string
} {
  const summary = buildLearnerSummaryText(snapshot)

  const progressLines = [
    ...(snapshot.sections.find((section) => section.title === "Next Step")?.items ?? [
      "No active plan decision is available yet.",
    ]),
    `Goals in scope: ${snapshot.goals.length}`,
    `Evidence records: ${snapshot.recentEvidence.length}`,
    `Open feedback items: ${snapshot.openFeedback.length}`,
    `Active misconceptions: ${snapshot.activeMisconceptions.length}`,
  ]

  const progress = [
    "<learner_progress>",
    ...progressLines.map((line) => `- ${compactLine(line)}`),
    "</learner_progress>",
  ].join("\n")

  const openFeedbackLines = snapshot.openFeedback.map((record) => compactLine(record.requiredAction)).slice(0, 8)
  const misconceptionLines = snapshot.activeMisconceptions.map((record) => compactLine(record.summary)).slice(0, 8)

  const feedback = [
    "<learner_feedback>",
    ...(openFeedbackLines.length > 0 ? openFeedbackLines.map((line) => `- ${line}`) : ["- No open feedback actions."]),
    ...(misconceptionLines.length > 0
      ? misconceptionLines.map((line) => `- Misconception: ${line}`)
      : ["- No active misconceptions."]),
    "</learner_feedback>",
  ].join("\n")

  return {
    learnerSummary: summary,
    learnerProgress: progress,
    learnerFeedback: feedback,
  }
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

  return `<workspace_state>\nState: ${workspaceState}\n${guidance}\n</workspace_state>`
}

function buildExplicitOverridesText(input: {
  intentOverride?: TeachingIntentId
  focusGoalIds: string[]
  activityBundle?: ActivityBundleCapability
}): string {
  const focusGoals = input.focusGoalIds.length > 0 ? input.focusGoalIds.join(", ") : "none"
  const activityOverride = input.activityBundle ? `${input.activityBundle.label} (${input.activityBundle.id})` : "none"

  return `<explicit_overrides>\nIntent override: ${input.intentOverride ?? "auto"}\nFocus goals: ${focusGoals}\nActivity bundle override: ${activityOverride}\n</explicit_overrides>`
}

function buildCapabilitySnapshotText(profile: RuntimeProfile): string {
  const allAllowedTools = collectPermissionKeys({
    permissions: profile.capabilityEnvelope.tools,
    includes: (access) => access === "allow",
  })

  const directTools = allAllowedTools.filter((toolId) => !toolId.startsWith("activity_"))
  const activityTools = allAllowedTools.filter((toolId) => toolId.startsWith("activity_"))

  const activitySkills = collectPermissionKeys({
    permissions: profile.capabilityEnvelope.skills,
    includes: (access) => access === "allow",
  })

  const subagents = collectPermissionKeys({
    permissions: profile.capabilityEnvelope.subagents,
    includes: (access) => access !== "deny",
    map: ({ id, access }) => (access === "prefer" ? `${id} (preferred)` : id),
  })

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
    return `<activity_capabilities>\nIntent focus: ${intentOverride ?? "auto"}\nNo first-class activity bundles are available for this persona and workspace state.\n</activity_capabilities>`
  }

  const bundleText = bundles
    .map((bundle) => {
      const skills =
        bundle.skills.length > 0 ? `\n  Skills (loadable via the native skill tool): ${bundle.skills.join(", ")}` : ""
      const tools = bundle.tools.length > 0 ? `\n  Tools (vendor-callable this turn): ${bundle.tools.join(", ")}` : ""
      const subagents = bundle.subagents.length > 0 ? `\n  Subagents: ${bundle.subagents.join(", ")}` : ""
      const whenToUse = bundle.whenToUse.length > 0 ? `\n  Use when: ${bundle.whenToUse[0]}` : ""
      return `- ${bundle.label} [${titleCaseFromKebab(bundle.intent)} | ${bundle.mode}] -> ${bundle.description}${skills}${tools}${subagents}${whenToUse}`
    })
    .join("\n")

  return `<activity_capabilities>\nIntent focus: ${intentOverride ?? "auto"}\n${bundleText}\n</activity_capabilities>`
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

function buildTeachingWorkspaceText(input: {
  context: TeachingPromptContext
  checkpointStatus?: TeachingCheckpointStatus
}): string {
  const checkpointStatus = input.checkpointStatus
    ? `\nCheckpoint status: ${input.checkpointStatus.changedSinceLastCheckpoint ? "pending acceptance" : "accepted"}`
    : ""

  const trackedFiles = input.checkpointStatus?.trackedFiles.length
    ? `\nTracked files:\n${input.checkpointStatus.trackedFiles.map((file) => `- ${file}`).join("\n")}`
    : ""

  const selection =
    input.context.selectionStartLine !== undefined &&
    input.context.selectionStartColumn !== undefined &&
    input.context.selectionEndLine !== undefined &&
    input.context.selectionEndColumn !== undefined
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
  const teachingContext = input.workspace.teachingContext
  const learnerSections = buildLearnerContextSections(input.learner.snapshot)

  const loadSkillsPromise = input.runtime.activityBundle
    ? loadBundledActivitySkills(input.runtime.activityBundle.skills)
    : Promise.resolve(undefined)

  const checkpointStatusPromise =
    input.workspace.teachingContext?.active && hasEditor
      ? getCheckpointStatus(input.runtime.directory, input.workspace.teachingContext.sessionID)
      : Promise.resolve(undefined)

  const [loadedSkills, checkpointStatus] = await Promise.all([loadSkillsPromise, checkpointStatusPromise])

  const runtimeSections: string[] = []

  // Keep top-level prompt assembly imperative so section order and inclusion stay obvious.
  runtimeSections.push(buildWorkspaceStateText(input.runtime.profile, workspaceState))
  runtimeSections.push(
    buildExplicitOverridesText({
      intentOverride: input.runtime.intentOverride,
      focusGoalIds: input.learner.focusGoalIds,
      activityBundle: input.runtime.activityBundle,
    }),
  )
  runtimeSections.push(buildCapabilitySnapshotText(input.runtime.profile))
  runtimeSections.push(buildActivityCapabilitiesText(input.runtime.profile, input.runtime.intentOverride))
  runtimeSections.push(learnerSections.learnerSummary)
  runtimeSections.push(learnerSections.learnerProgress)
  runtimeSections.push(learnerSections.learnerFeedback)

  if (input.runtime.activityBundle && loadedSkills) {
    runtimeSections.push(
      buildSelectedActivityText({
        activityBundle: input.runtime.activityBundle,
        loadedSkills,
      }),
    )
  }

  if (teachingContext?.active && hasEditor) {
    runtimeSections.push(
      buildTeachingWorkspaceText({
        context: teachingContext,
        checkpointStatus,
      }),
    )
  }

  return {
    runtimeContext: `<buddy_runtime_context>\n\n${runtimeSections.join("\n\n")}\n\n</buddy_runtime_context>`,
    changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
  }
}

export async function buildSystemContext(input: PromptBuildContext): Promise<SystemContextBuild> {
  const profile = input.runtime.profile
  const teachingWorkspacePolicy = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
    ? `\n\n${RAW_TEACHING_POLICY_PROMPT.trim()}`
    : ""

  const stableHeader = `<buddy_runtime_header>
Persona: ${profile.persona}
Runtime agent: ${profile.runtimeAgent}

Teaching principles:
Use explanation to unlock progress, practice to create evidence, and checks to verify understanding.
Do not wait for backend routing. Decide live from the learner's message, the history, and the current learner state.
Use the learner store and workspace context when they materially improve the answer.

Tooling guidance:
Available surfaces: ${profile.capabilityEnvelope.visibleSurfaces.join(", ") || "chat"}
Tool permissions are authoritative. Use persona-specific tools and subagents when they are available, but do not assume unavailable capabilities exist.
Optional activity capabilities should do real work such as generating practice, generating checks, or mutating the lesson workspace; do not treat them as a hidden routing layer.

Runtime usage notes:
The learner may optionally steer the session with an explicit intent override, but the teacher agent decides the pedagogical flow from conversation history, learner state, and available tools.
Sidebar suggestions are advisory learner-facing shortcuts. Treat them as agent input only when the learner explicitly clicks or sends one.
First-class activity bundles may expose skills, tools, and subagents. Load a skill only when you want its full procedure; do not call skills as a formality.
When the learner asks which Buddy teaching skills or tools are available, answer from the current activity capabilities and runtime permissions first. Other globally installed skills may also exist, but they are not the Buddy teaching playbook.
</buddy_runtime_header>${teachingWorkspacePolicy}`

  const runtimeContext = await buildRuntimeContext(input)

  return {
    systemContext: [stableHeader, runtimeContext.runtimeContext].filter(Boolean).join("\n\n"),
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  }
}
