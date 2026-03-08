import { compileRuntimeProfile } from "../../runtime/compiler.js"
import type { WorkspaceState } from "../../runtime/types.js"
import { getBuddyPersona } from "../../../personas/catalog.js"
import { LearnerArtifactStore } from "../artifacts/store.js"
import type {
  DecisionArtifact,
  EvidenceArtifact,
  FeedbackArtifact,
  GoalArtifact,
  MisconceptionArtifact,
  SnapshotPlan,
  SnapshotQuery,
  WorkspaceContextArtifact,
} from "../artifacts/types.js"

export type LearnerSnapshot = {
  workspace: WorkspaceContextArtifact
  profile: Awaited<ReturnType<typeof LearnerArtifactStore.ensureProfile>>
  goals: GoalArtifact[]
  activeMisconceptions: MisconceptionArtifact[]
  openFeedback: FeedbackArtifact[]
  recentEvidence: EvidenceArtifact[]
  latestPlan?: DecisionArtifact
  constraintsSummary: string[]
  activityBundles: ReturnType<typeof compileRuntimeProfile>["capabilityEnvelope"]["activityBundles"]
  sections: Array<{
    title: string
    items: string[]
  }>
  markdown: string
  decisionInputFingerprint: string
}

function cleanDisplayValue(value: string) {
  return value.trim().replace(/^["']+|["']+$/g, "")
}

function summarizeConstraints(input: {
  workspace: WorkspaceContextArtifact
  profile: Awaited<ReturnType<typeof LearnerArtifactStore.ensureProfile>>
}) {
  return [
    ...input.profile.motivationAnchors.map((value) => `Motivation: ${cleanDisplayValue(value)}`),
    ...input.profile.availableTimePatterns.map((value) => `Time: ${cleanDisplayValue(value)}`),
    ...input.profile.toolEnvironmentLimits.map((value) => `Environment: ${cleanDisplayValue(value)}`),
    ...input.workspace.projectConstraints.map((value) => `Project constraint: ${cleanDisplayValue(value)}`),
    ...input.workspace.localToolAvailability.map((value) => `Local tools: ${cleanDisplayValue(value)}`),
    ...(input.workspace.motivationContext
      ? [`Workspace context: ${cleanDisplayValue(input.workspace.motivationContext)}`]
      : []),
    ...input.workspace.opportunities.map((value) => `Workspace opportunity: ${cleanDisplayValue(value)}`),
  ].slice(0, 8)
}

function fallbackPlan(): SnapshotPlan {
  return {
    suggestedActivity: "goal-setting",
    suggestedScaffoldingLevel: "guided",
    warmupGoalIds: [],
    alternatives: [],
    rationale: ["No current plan decision exists yet."],
    riskFlags: [],
    followUpQuestions: [],
  }
}

function buildSections(input: {
  goals: GoalArtifact[]
  openFeedback: FeedbackArtifact[]
  activeMisconceptions: MisconceptionArtifact[]
  plan: SnapshotPlan
  constraintsSummary: string[]
}) {
  return [
    {
      title: "Active Goals",
      items: input.goals.length > 0 ? input.goals.map((goal) => goal.statement) : ["No active goals in this workspace yet."],
    },
    {
      title: "Next Step",
      items: [
        `Suggested activity: ${input.plan.suggestedActivity}`,
        `Scaffolding: ${input.plan.suggestedScaffoldingLevel}`,
        ...input.plan.rationale,
      ],
    },
    {
      title: "Open Feedback",
      items:
        input.openFeedback.length > 0
          ? input.openFeedback
              .filter((record) => record.kind === "feedback")
              .map((record) => record.requiredAction)
          : ["No open feedback items."],
    },
    {
      title: "Misconceptions",
      items:
        input.activeMisconceptions.length > 0
          ? input.activeMisconceptions
              .filter((record) => record.kind === "misconception")
              .map((record) => record.summary)
          : ["No active misconceptions."],
    },
    {
      title: "Constraints",
      items: input.constraintsSummary.length > 0 ? input.constraintsSummary : ["No explicit constraints."],
    },
  ]
}

function buildMarkdown(workspaceLabel: string, sections: Array<{ title: string; items: string[] }>) {
  return [
    "# Learning Snapshot",
    "",
    `Workspace: ${workspaceLabel}`,
    "",
    ...sections.flatMap((section) => [`## ${section.title}`, ...section.items.map((item) => `- ${item}`), ""]),
  ].join("\n")
}

function buildDecisionInputFingerprint(input: {
  query: SnapshotQuery
  workspace: WorkspaceContextArtifact
  profile: Awaited<ReturnType<typeof LearnerArtifactStore.ensureProfile>>
  goals: GoalArtifact[]
  openFeedback: FeedbackArtifact[]
  activeMisconceptions: MisconceptionArtifact[]
  recentEvidence: EvidenceArtifact[]
  constraintsSummary: string[]
  activityBundles: ReturnType<typeof compileRuntimeProfile>["capabilityEnvelope"]["activityBundles"]
}) {
  return [
    `workspace:${input.workspace.workspaceId}@${input.workspace.updatedAt}`,
    `profile:${input.profile.id}@${input.profile.updatedAt}`,
    `persona:${input.query.persona}`,
    `intent:${input.query.intent ?? ""}`,
    `workspaceState:${input.query.workspaceState ?? ""}`,
    `focusGoals:${[...input.query.focusGoalIds].sort().join(",")}`,
    `goals:${[...input.goals].map((goal) => `${goal.id}@${goal.updatedAt}`).sort().join(",")}`,
    `feedback:${[...input.openFeedback].map((feedback) => `${feedback.id}@${feedback.updatedAt}`).sort().join(",")}`,
    `misconceptions:${[...input.activeMisconceptions].map((record) => `${record.id}@${record.updatedAt}`).sort().join(",")}`,
    `evidence:${[...input.recentEvidence].map((record) => `${record.id}@${record.updatedAt}`).sort().join(",")}`,
    `constraints:${input.constraintsSummary.join("|")}`,
    `bundles:${input.activityBundles.map((bundle) => bundle.id).join(",")}`,
  ].join("\n")
}

export namespace LearnerSnapshotCompiler {
  export async function compile(input: {
    directory: string
    query: SnapshotQuery
  }): Promise<LearnerSnapshot> {
    const workspace = await LearnerArtifactStore.ensureWorkspaceContext(input.directory)
    const profile = await LearnerArtifactStore.ensureProfile()
    const goals = (await LearnerArtifactStore.readArtifacts(input.directory, "goal"))
      .filter((record): record is GoalArtifact => record.kind === "goal" && record.status === "active")

    const scopedGoalIds = input.query.focusGoalIds.length > 0
      ? new Set(input.query.focusGoalIds)
      : new Set(goals.map((goal) => goal.id))

    const scopedGoals = goals.filter((goal) => scopedGoalIds.has(goal.id))
    const evidence = await LearnerArtifactStore.readArtifacts(input.directory, "evidence")
    const openFeedback = (await LearnerArtifactStore.readArtifacts(input.directory, "feedback"))
      .filter((record): record is FeedbackArtifact => record.kind === "feedback" && record.status === "open")
      .filter((record) => record.goalIds.some((goalId) => scopedGoalIds.has(goalId)))
    const activeMisconceptions = (await LearnerArtifactStore.readArtifacts(input.directory, "misconception"))
      .filter((record): record is MisconceptionArtifact => record.kind === "misconception" && record.status === "active")
      .filter((record) => record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId)))
    const decisionPlans = (await LearnerArtifactStore.readArtifacts(input.directory, "decision-plan"))
      .filter((record): record is DecisionArtifact => record.kind === "decision-plan")
    const latestPlan = decisionPlans
      .filter((record) => {
        if (input.query.focusGoalIds.length === 0) return true
        if (record.goalIds.length === 0) return false
        return input.query.focusGoalIds.every((goalId) => record.goalIds.includes(goalId))
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]

    const plan = latestPlan?.payload && typeof latestPlan.payload === "object"
      ? (latestPlan.payload as SnapshotPlan)
      : fallbackPlan()

    const workspaceState: WorkspaceState = input.query.workspaceState ?? "chat"
    const runtimeProfile = compileRuntimeProfile({
      persona: getBuddyPersona(input.query.persona),
      workspaceState,
      intentOverride: input.query.intent,
    })

    const constraintsSummary = summarizeConstraints({
      workspace,
      profile,
    })
    const sections = buildSections({
      goals: scopedGoals,
      openFeedback,
      activeMisconceptions,
      plan,
      constraintsSummary,
    })
    const recentEvidence = evidence
      .filter((record): record is EvidenceArtifact => record.kind === "evidence")
      .filter((record) => record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20)
    const decisionInputFingerprint = buildDecisionInputFingerprint({
      query: input.query,
      workspace,
      profile,
      goals: scopedGoals,
      openFeedback,
      activeMisconceptions,
      recentEvidence,
      constraintsSummary,
      activityBundles: runtimeProfile.capabilityEnvelope.activityBundles,
    })

    return {
      workspace,
      profile,
      goals: scopedGoals,
      activeMisconceptions,
      openFeedback,
      recentEvidence,
      latestPlan,
      constraintsSummary,
      activityBundles: runtimeProfile.capabilityEnvelope.activityBundles,
      sections,
      markdown: buildMarkdown(workspace.label, sections),
      decisionInputFingerprint,
    }
  }
}
