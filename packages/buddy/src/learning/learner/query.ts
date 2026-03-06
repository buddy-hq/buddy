import { getBuddyPersona } from "../../personas/catalog.js"
import { resolvePreferredActivityBundle } from "../runtime/activity-bundles.js"
import { compileRuntimeProfile } from "../runtime/compiler.js"
import type { LearnerPromptDigest, WorkspaceState } from "../runtime/types.js"
import { buildOpenFeedbackActions } from "./feedback.js"
import { buildAlignmentSummary, buildSessionPlan, summarizeConstraints } from "./sequencing.js"
import type {
  AlignmentRecord,
  FeedbackRecord,
  GoalEdge,
  GoalRecord,
  LearningPlanAction,
  LearnerConstraints,
  LearnerCurriculumView,
  LearnerPromptQuery,
  ProgressRecord,
  ReviewRecord,
  WorkspaceContext,
} from "./types.js"

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "into",
  "from",
  "that",
  "this",
  "your",
  "learn",
  "buddy",
  "workspace",
  "project",
])

export function inferTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ).slice(0, 12)
}

function relevantGoals(input: {
  goals: GoalRecord[]
  workspace: WorkspaceContext
  query: LearnerPromptQuery
}) {
  const pinned = new Set(input.workspace.pinnedGoalIds)
  const current = new Set(input.query.focusGoalIds)
  const workspaceTags = new Set(input.workspace.tags)

  const active = input.goals.filter((goal) => !goal.archivedAt)
  const explicitlySelected = active.filter((goal) => current.has(goal.goalId))
  if (explicitlySelected.length > 0) return explicitlySelected

  const pinnedGoals = active.filter((goal) => pinned.has(goal.goalId))
  if (pinnedGoals.length > 0) return pinnedGoals

  const workspaceGoals = active.filter((goal) => goal.workspaceRefs.includes(input.workspace.workspaceId))
  if (workspaceGoals.length > 0) return workspaceGoals

  const conceptGoals = active.filter((goal) => goal.conceptTags.some((tag) => workspaceTags.has(tag)))
  if (conceptGoals.length > 0) return conceptGoals

  return active.slice(0, 6)
}

function goalLabel(input: {
  goal: GoalRecord
  progress?: ProgressRecord
}) {
  return input.progress ? `${input.goal.statement} (${formatTitleCase(input.progress.status)})` : input.goal.statement
}

function formatTitleCase(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatActivityLabel(value: string) {
  return formatTitleCase(value)
}

function buildLearningPlanActions(input: {
  coldStart: boolean
  sessionPlan: LearnerCurriculumView["sessionPlan"]
  goalById: Map<string, GoalRecord>
  openFeedbackActions: LearnerCurriculumView["openFeedbackActions"]
  relevantGoalIds: string[]
  persona: LearnerPromptQuery["persona"]
  workspaceState: "chat" | "interactive"
}): LearningPlanAction[] {
  const persona = getBuddyPersona(input.persona)

  function preferredBundle(intent: LearningPlanAction["intent"], activity?: Parameters<typeof resolvePreferredActivityBundle>[0]["activity"]) {
    if (!intent) return undefined
    return resolvePreferredActivityBundle({
      persona,
      intent,
      activity,
      workspaceState: input.workspaceState,
    })
  }

  if (input.coldStart) {
    const bundle = preferredBundle("learn")
    return [
      {
        actionId: "define-goals",
        label: "Define Goals",
        prompt: "Help me define 3 concrete learning goals for this workspace, then start with guided practice.",
        intent: "learn",
        activityBundleId: bundle?.id,
        activityBundleLabel: bundle?.label,
        focusGoalIds: [],
        reason: "No relevant goals exist yet for this workspace.",
      },
    ]
  }

  const primaryGoal = input.sessionPlan.primaryGoalId ? input.goalById.get(input.sessionPlan.primaryGoalId) : undefined
  const warmupGoal = input.sessionPlan.warmupReviewGoalIds[0]
    ? input.goalById.get(input.sessionPlan.warmupReviewGoalIds[0])
    : undefined
  const openFeedback = input.openFeedbackActions[0]
  const actions: LearningPlanAction[] = []

  if (warmupGoal) {
    const bundle = preferredBundle("assess", "retrieval-check")
    actions.push({
      actionId: "review-due",
      label: "Review Due Item",
      prompt: `Run a quick review for this goal: ${warmupGoal.statement}. Keep it concise, then tell me if I need repair practice.`,
      intent: "assess",
      activityBundleId: bundle?.id,
      activityBundleLabel: bundle?.label,
      focusGoalIds: [warmupGoal.goalId],
      reason: "A spaced-retrieval review item is due.",
    })
  }

  if (openFeedback) {
    const bundle = preferredBundle("practice", "guided-practice")
    actions.push({
      actionId: "resolve-feedback",
      label: "Resolve Feedback",
      prompt: `Help me act on this open feedback for the linked goals: ${openFeedback.requiredAction}. Give me one focused practice task that closes the loop.`,
      intent: "practice",
      activityBundleId: bundle?.id,
      activityBundleLabel: bundle?.label,
      focusGoalIds: openFeedback.goalIds,
      reason: "There is an open feedback action that still needs follow-through.",
    })
  }

  if (input.sessionPlan.suggestedActivity === "mastery-check") {
    const bundle = preferredBundle("assess", "mastery-check")
    actions.push({
      actionId: "run-check",
      label: "Run Mastery Check",
      prompt: primaryGoal
        ? `Run one concise mastery check for this goal: ${primaryGoal.statement}. Use explicit evidence criteria and tell me the next action.`
        : "Run one concise mastery check for the current goal and tell me the next action.",
      intent: "assess",
      activityBundleId: bundle?.id,
      activityBundleLabel: bundle?.label,
      focusGoalIds: primaryGoal ? [primaryGoal.goalId] : input.relevantGoalIds,
      reason: "The current evidence suggests a mastery check is the right next move.",
    })
  } else if (
    input.sessionPlan.suggestedActivity === "guided-practice" ||
    input.sessionPlan.suggestedActivity === "independent-practice"
  ) {
    const bundle = preferredBundle("practice", input.sessionPlan.suggestedActivity)
    actions.push({
      actionId: "start-practice",
      label:
        input.sessionPlan.suggestedActivity === "independent-practice"
          ? "Start Independent Practice"
          : "Start Guided Practice",
      prompt: primaryGoal
        ? `Start ${input.sessionPlan.suggestedActivity === "independent-practice" ? "independent" : "guided"} practice for this goal: ${primaryGoal.statement}. Target the real skill, not a recap.`
        : `Start ${input.sessionPlan.suggestedActivity === "independent-practice" ? "independent" : "guided"} practice for the current goal.`,
      intent: "practice",
      activityBundleId: bundle?.id,
      activityBundleLabel: bundle?.label,
      focusGoalIds: primaryGoal ? [primaryGoal.goalId] : input.relevantGoalIds,
      reason: "Practice is the recommended next learning move.",
    })
  } else {
    const bundle = preferredBundle("learn", input.sessionPlan.suggestedActivity === "worked-example" ? "worked-example" : "explanation")
    actions.push({
      actionId: "understand-next",
      label: "Understand First",
      prompt: primaryGoal
        ? `Help me understand this goal just enough to start practicing: ${primaryGoal.statement}. Use one worked example if needed.`
        : "Help me understand the next concept just enough to start practicing.",
      intent: "learn",
      activityBundleId: bundle?.id,
      activityBundleLabel: bundle?.label,
      focusGoalIds: primaryGoal ? [primaryGoal.goalId] : input.relevantGoalIds,
      reason: "Explanation or framing is the best next move before more practice.",
    })
  }

  const deduped = new Map<string, LearningPlanAction>()
  for (const action of actions) {
    if (!deduped.has(action.actionId)) {
      deduped.set(action.actionId, action)
    }
  }

  return Array.from(deduped.values()).slice(0, 3)
}

export function buildLearnerPromptDigest(input: {
  workspace: WorkspaceContext
  goals: GoalRecord[]
  edges: GoalEdge[]
  progress: ProgressRecord[]
  review: ReviewRecord[]
  alignment: AlignmentRecord[]
  feedback: FeedbackRecord[]
  constraints: LearnerConstraints
  query: LearnerPromptQuery
  misconceptions: string[]
}): LearnerPromptDigest {
  const relevant = relevantGoals({
    goals: input.goals,
    workspace: input.workspace,
    query: input.query,
  })
  const relevantGoalIds = relevant.map((goal) => goal.goalId)
  const progressByGoal = new Map(input.progress.map((record) => [record.goalId, record]))
  const reviewByGoal = new Map(input.review.map((record) => [record.goalId, record]))
  const alignmentSummary = buildAlignmentSummary(
    input.alignment.filter((record) => relevantGoalIds.includes(record.goalId)),
  )
  const openFeedbackActions = buildOpenFeedbackActions(
    input.feedback.filter((record) => record.goalIds.some((goalId) => relevantGoalIds.includes(goalId))),
  )
  const constraintsSummary = summarizeConstraints({
    constraints: input.constraints,
    workspace: input.workspace,
  })
  const sessionPlan = buildSessionPlan({
    goals: relevant,
    edges: input.edges.filter(
      (edge) => relevantGoalIds.includes(edge.fromGoalId) || relevantGoalIds.includes(edge.toGoalId),
    ),
    progress: input.progress,
    review: input.review.filter((record) => relevantGoalIds.includes(record.goalId)),
    alignment: input.alignment.filter((record) => relevantGoalIds.includes(record.goalId)),
    constraints: input.constraints,
    workspace: input.workspace,
    focusGoalIds: input.query.focusGoalIds,
    openFeedbackActions,
  })

  if (relevantGoalIds.length === 0) {
    const coldConstraints = constraintsSummary.length > 0 ? constraintsSummary : [`Workspace focus: ${input.workspace.label}`]
    return {
      coldStart: true,
      workspaceLabel: input.workspace.label,
      workspaceTags: input.workspace.tags,
      relevantGoalIds: [],
      recommendedNextAction: "goal-setting",
      constraintsSummary: coldConstraints,
      openFeedbackActions: [],
      sessionPlanSummary: [
        "Start by defining what the learner should be able to do in this workspace.",
        "Then move quickly into guided practice rather than staying in explanation too long.",
      ],
      alignmentSummary: [],
      tier1: [
        "<learner_state>",
        `Workspace focus: ${input.workspace.label}`,
        "No relevant goals exist yet for this workspace.",
        "</learner_state>",
      ],
      tier2: constraintsSummary.length > 0 ? constraintsSummary : [],
      tier3: [],
    }
  }

  const tier1 = ["<learner_state>"]
  for (const goal of relevant.slice(0, 5)) {
    tier1.push(`- ${goalLabel({ goal, progress: progressByGoal.get(goal.goalId) })}`)
  }
  if (input.misconceptions.length > 0) {
    tier1.push(`Active misconceptions: ${input.misconceptions.join("; ")}`)
  }
  if (openFeedbackActions.length > 0) {
    tier1.push(`Open feedback actions: ${openFeedbackActions.map((item) => item.requiredAction).join(" | ")}`)
  }
  tier1.push("</learner_state>")

  const tier2 = [
    ...sessionPlan.rationale.map((value) => `Plan: ${value}`),
    ...input.review
      .filter((record) => relevantGoalIds.includes(record.goalId))
      .slice(0, 2)
      .map((record) => `Review ${record.status}: ${record.goalId} (${record.reason})`),
    ...constraintsSummary.slice(0, 3),
  ]

  const tier3 = [
    ...alignmentSummary.recommendations.slice(0, 2).map((value) => `Alignment: ${value}`),
    ...(sessionPlan.motivationHook ? [`Why this matters: ${sessionPlan.motivationHook}`] : []),
    ...(sessionPlan.prerequisiteWarnings.length > 0
      ? sessionPlan.prerequisiteWarnings.map((value) => `Prerequisite: ${value}`)
      : []),
  ]

  return {
    coldStart: false,
    workspaceLabel: input.workspace.label,
    workspaceTags: input.workspace.tags,
    relevantGoalIds,
    recommendedNextAction: sessionPlan.suggestedActivity,
    constraintsSummary,
    openFeedbackActions: openFeedbackActions.map((item) => item.requiredAction),
    sessionPlanSummary: [
      sessionPlan.primaryGoalId ? `Primary goal: ${sessionPlan.primaryGoalId}` : "Primary goal: not selected",
      ...sessionPlan.rationale,
      ...(sessionPlan.motivationHook ? [`Motivation: ${sessionPlan.motivationHook}`] : []),
    ],
    alignmentSummary: alignmentSummary.recommendations,
    tier1,
    tier2,
    tier3,
  }
}

export function buildCurriculumView(input: {
  workspace: WorkspaceContext
  digest: LearnerPromptDigest
  goals: GoalRecord[]
  edges: GoalEdge[]
  progress: ProgressRecord[]
  review: ReviewRecord[]
  alignment: AlignmentRecord[]
  feedback: FeedbackRecord[]
  constraints: LearnerConstraints
  focusGoalIds: string[]
  persona: LearnerPromptQuery["persona"]
  intent?: LearnerPromptQuery["intent"]
  workspaceState: WorkspaceState
}): LearnerCurriculumView {
  const goalById = new Map(input.goals.map((goal) => [goal.goalId, goal]))
  const progressByGoal = new Map(input.progress.map((record) => [record.goalId, record]))
  const scopedAlignment = input.alignment.filter((record) => input.digest.relevantGoalIds.includes(record.goalId))
  const alignmentSummary = buildAlignmentSummary(scopedAlignment)
  const openFeedbackActions = buildOpenFeedbackActions(
    input.feedback.filter((record) => record.goalIds.some((goalId) => input.digest.relevantGoalIds.includes(goalId))),
  )
  const sessionPlan = buildSessionPlan({
    goals: input.goals.filter((goal) => input.digest.relevantGoalIds.includes(goal.goalId)),
    edges: input.edges.filter(
      (edge) => input.digest.relevantGoalIds.includes(edge.fromGoalId) || input.digest.relevantGoalIds.includes(edge.toGoalId),
    ),
    progress: input.progress,
    review: input.review.filter((record) => input.digest.relevantGoalIds.includes(record.goalId)),
    alignment: scopedAlignment,
    constraints: input.constraints,
    workspace: input.workspace,
    focusGoalIds: input.focusGoalIds,
    openFeedbackActions,
  })
  const constraintsSummary = summarizeConstraints({
    constraints: input.constraints,
    workspace: input.workspace,
  })
  const runtimeProfile = compileRuntimeProfile({
    persona: getBuddyPersona(input.persona),
    workspaceState: input.workspaceState,
    intentOverride: input.intent,
  })
  const actions = buildLearningPlanActions({
    coldStart: input.digest.coldStart,
    sessionPlan,
    goalById,
    openFeedbackActions,
    relevantGoalIds: input.digest.relevantGoalIds,
    persona: input.persona,
    workspaceState: input.workspaceState,
  })
  const activityBundleItems = runtimeProfile.capabilityEnvelope.activityBundles.map((bundle) => {
    const capabilities = [
      bundle.skills.length > 0 ? `skills: ${bundle.skills.join(", ")}` : "",
      bundle.tools.length > 0 ? `tools: ${bundle.tools.join(", ")}` : "",
      bundle.subagents.length > 0 ? `helpers: ${bundle.subagents.join(", ")}` : "",
    ].filter(Boolean)

    return `${bundle.label} (${formatTitleCase(bundle.intent)}): ${bundle.description}${capabilities.length > 0 ? ` [${capabilities.join(" | ")}]` : ""}`
  })

  const goalItems = input.digest.relevantGoalIds.map((goalId) => {
    const goal = goalById.get(goalId)
    const progress = progressByGoal.get(goalId)
    if (!goal) return goalId
    return goalLabel({ goal, progress })
  })

  const reviewItems = input.review
    .filter((record) => input.digest.relevantGoalIds.includes(record.goalId))
    .map((record) => {
      const goal = goalById.get(record.goalId)
      return `${goal?.statement ?? record.goalId}: ${record.reason}`
    })

  const sections = input.digest.coldStart
    ? [
        {
          title: "Getting Started",
          items: [
            `Workspace focus: ${input.workspace.label}`,
            "No relevant goals exist yet.",
            "Ask Buddy to define the goals for this workspace, then move into guided practice quickly.",
          ],
        },
      ]
    : [
        {
          title: "Active Goals",
          items: goalItems,
        },
        {
          title: "Next Up",
          items: [
            sessionPlan.primaryGoalId
              ? `${goalById.get(sessionPlan.primaryGoalId)?.statement ?? sessionPlan.primaryGoalId} -> ${formatActivityLabel(sessionPlan.suggestedActivity)}`
              : `Suggested activity: ${formatActivityLabel(sessionPlan.suggestedActivity)}`,
            ...sessionPlan.rationale,
            ...(sessionPlan.motivationHook ? [`Why this matters: ${sessionPlan.motivationHook}`] : []),
            ...sessionPlan.prerequisiteWarnings,
          ],
        },
        {
          title: "Review",
          items: reviewItems.length > 0 ? reviewItems : ["No review items due right now."],
        },
        {
          title: "Coverage",
          items:
            alignmentSummary.recommendations.length > 0
              ? alignmentSummary.recommendations
              : ["Coverage is healthy across practice and assessment."],
        },
        {
          title: "Required Actions",
          items:
            openFeedbackActions.length > 0
              ? openFeedbackActions.map((item) => item.requiredAction)
              : ["No open feedback actions right now."],
        },
        {
          title: "Activity Bundles",
          items: activityBundleItems.length > 0 ? activityBundleItems : ["No first-class activity bundles are available right now."],
        },
      ]

  const markdown = [
    "# Learning Plan",
    "",
    `Workspace: ${input.workspace.label}`,
    "",
    `Recommended next action: ${formatActivityLabel(input.digest.recommendedNextAction)}`,
    ...(sessionPlan.motivationHook ? ["", `Why this matters: ${sessionPlan.motivationHook}`] : []),
    "",
    ...sections.flatMap((section) => [`## ${section.title}`, ...section.items.map((item) => `- ${item}`), ""]),
    ...(constraintsSummary.length > 0
      ? ["## Constraints & Opportunities", ...constraintsSummary.map((item) => `- ${item}`), ""]
      : []),
  ].join("\n")

  return {
    workspace: input.workspace,
    coldStart: input.digest.coldStart,
    recommendedNextAction: input.digest.recommendedNextAction,
    sessionPlan,
    alignmentSummary,
    openFeedbackActions,
    actions,
    activityBundles: runtimeProfile.capabilityEnvelope.activityBundles,
    constraintsSummary,
    markdown,
    sections,
  }
}
