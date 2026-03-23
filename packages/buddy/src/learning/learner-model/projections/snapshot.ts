import { resolveCapabilityProfile } from "../../resolve-capability-profile"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import type { WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { getBuddyPersona } from "../../personas"
import { LearnerArtifactStore } from "../repository/store"
import type {
  EvidenceArtifact,
  FeedbackArtifact,
  GoalArtifact,
  MisconceptionArtifact,
  SnapshotQuery,
  WorkspaceContextArtifact,
} from "../repository/types"

type RuntimeProfile = ReturnType<typeof resolveCapabilityProfile>

export type LearnerSnapshot = {
  workspace: WorkspaceContextArtifact
  profile: Awaited<ReturnType<typeof LearnerArtifactStore.ensureProfile>>
  goals: GoalArtifact[]
  activeMisconceptions: MisconceptionArtifact[]
  openFeedback: FeedbackArtifact[]
  recentEvidence: EvidenceArtifact[]
  constraintsSummary: string[]
  sections: Array<{
    title: string
    items: string[]
  }>
  markdown: string
  decisionInputFingerprint: string
  runtimeContext: {
    intent: SnapshotQuery["intent"]
    workspaceState: WorkspaceState
  }
  runtimeProfile: RuntimeProfile
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
    ...input.profile.toolEnvironmentLimits.map(
      (value) => `Environment: ${cleanDisplayValue(value)}`,
    ),
    ...input.workspace.projectConstraints.map(
      (value) => `Project constraint: ${cleanDisplayValue(value)}`,
    ),
    ...input.workspace.localToolAvailability.map(
      (value) => `Local tools: ${cleanDisplayValue(value)}`,
    ),
    ...(input.workspace.motivationContext
      ? [`Workspace context: ${cleanDisplayValue(input.workspace.motivationContext)}`]
      : []),
    ...input.workspace.opportunities.map(
      (value) => `Workspace opportunity: ${cleanDisplayValue(value)}`,
    ),
  ].slice(0, 8)
}

function buildSections(input: {
  goals: GoalArtifact[]
  openFeedback: FeedbackArtifact[]
  activeMisconceptions: MisconceptionArtifact[]
  constraintsSummary: string[]
}) {
  return [
    {
      title: "Active Goals",
      items:
        input.goals.length > 0
          ? input.goals.map((goal) => goal.statement)
          : ["No active goals in this workspace yet."],
    },
    {
      title: "Open Feedback",
      items:
        input.openFeedback.length > 0
          ? input.openFeedback.map((record) => record.requiredAction)
          : ["No open feedback items."],
    },
    {
      title: "Misconceptions",
      items:
        input.activeMisconceptions.length > 0
          ? input.activeMisconceptions.map((record) => record.summary)
          : ["No active misconceptions."],
    },
    {
      title: "Constraints",
      items:
        input.constraintsSummary.length > 0
          ? input.constraintsSummary
          : ["No explicit constraints."],
    },
  ]
}

function buildMarkdown(
  workspaceLabel: string,
  sections: Array<{ title: string; items: string[] }>,
) {
  return [
    "# Learning Snapshot",
    "",
    `Workspace: ${workspaceLabel}`,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      ...section.items.map((item) => `- ${item}`),
      "",
    ]),
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
}) {
  return [
    `workspace:${input.workspace.workspaceId}@${input.workspace.updatedAt}`,
    `profile:${input.profile.id}@${input.profile.updatedAt}`,
    `persona:${input.query.persona}`,
    `intent:${input.query.intent ?? ""}`,
    `workspaceState:${input.query.workspaceState ?? ""}`,
    `focusGoals:${[...input.query.focusGoalIds].toSorted().join(",")}`,
    `goals:${[...input.goals]
      .map((goal) => `${goal.id}@${goal.updatedAt}`)
      .toSorted()
      .join(",")}`,
    `feedback:${[...input.openFeedback]
      .map((feedback) => `${feedback.id}@${feedback.updatedAt}`)
      .toSorted()
      .join(",")}`,
    `misconceptions:${[...input.activeMisconceptions]
      .map((record) => `${record.id}@${record.updatedAt}`)
      .toSorted()
      .join(",")}`,
    `evidence:${[...input.recentEvidence]
      .map((record) => `${record.id}@${record.updatedAt}`)
      .toSorted()
      .join(",")}`,
    `constraints:${input.constraintsSummary.join("|")}`,
  ].join("\n")
}

export namespace LearnerSnapshotCompiler {
  export async function compile(input: {
    directory: string
    query: SnapshotQuery
  }): Promise<LearnerSnapshot> {
    const projectConfig = await readProjectConfig(input.directory)
    const workspace = await LearnerArtifactStore.ensureWorkspaceContext(input.directory)
    const profile = await LearnerArtifactStore.ensureProfile()
    const goals = (await LearnerArtifactStore.readArtifacts(input.directory, "goal")).filter(
      (record): record is GoalArtifact => record.kind === "goal" && record.status === "active",
    )

    const scopedGoalIds =
      input.query.focusGoalIds.length > 0
        ? new Set(input.query.focusGoalIds)
        : new Set(goals.map((goal) => goal.id))

    const scopedGoals = goals.filter((goal) => scopedGoalIds.has(goal.id))
    const evidence = await LearnerArtifactStore.readArtifacts(input.directory, "evidence")
    const openFeedback = (await LearnerArtifactStore.readArtifacts(input.directory, "feedback"))
      .filter(
        (record): record is FeedbackArtifact =>
          record.kind === "feedback" && record.status === "open",
      )
      .filter((record) => record.goalIds.some((goalId) => scopedGoalIds.has(goalId)))
    const activeMisconceptions = (
      await LearnerArtifactStore.readArtifacts(input.directory, "misconception")
    )
      .filter(
        (record): record is MisconceptionArtifact =>
          record.kind === "misconception" && record.status === "active",
      )
      .filter(
        (record) =>
          record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId)),
      )

    const workspaceState: WorkspaceState = input.query.workspaceState ?? "chat"
    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona(input.query.persona),
      workspaceState,
      intent: input.query.intent,
      configuredToolToggles: projectConfig.tools,
    })

    const constraintsSummary = summarizeConstraints({
      workspace,
      profile,
    })
    const sections = buildSections({
      goals: scopedGoals,
      openFeedback,
      activeMisconceptions,
      constraintsSummary,
    })
    const recentEvidence = evidence
      .filter((record): record is EvidenceArtifact => record.kind === "evidence")
      .filter(
        (record) =>
          record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId)),
      )
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
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
    })

    return {
      workspace,
      profile,
      goals: scopedGoals,
      activeMisconceptions,
      openFeedback,
      recentEvidence,
      constraintsSummary,
      sections,
      markdown: buildMarkdown(workspace.label, sections),
      decisionInputFingerprint,
      runtimeContext: {
        intent: input.query.intent,
        workspaceState,
      },
      runtimeProfile,
    }
  }
}
