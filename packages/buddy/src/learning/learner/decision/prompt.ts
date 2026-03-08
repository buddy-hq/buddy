import type { LearnerSnapshot } from "../compiler/snapshot.js"

function trimLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function goalLines(snapshot: LearnerSnapshot) {
  if (snapshot.goals.length === 0) {
    return ["- No active goals."]
  }

  return snapshot.goals.slice(0, 8).map((goal) => `- ${goal.id}: ${trimLine(goal.statement)}`)
}

function feedbackLines(snapshot: LearnerSnapshot) {
  if (snapshot.openFeedback.length === 0) {
    return ["- No open feedback actions."]
  }

  return snapshot.openFeedback
    .slice(0, 8)
    .map((record) => `- ${trimLine(record.requiredAction)}`)
}

function misconceptionLines(snapshot: LearnerSnapshot) {
  if (snapshot.activeMisconceptions.length === 0) {
    return ["- No active misconceptions."]
  }

  return snapshot.activeMisconceptions
    .slice(0, 8)
    .map((record) => `- ${trimLine(record.summary)}`)
}

function evidenceLines(snapshot: LearnerSnapshot) {
  if (snapshot.recentEvidence.length === 0) {
    return ["- No recent evidence."]
  }

  return snapshot.recentEvidence
    .slice(0, 8)
    .map((record) => `- (${record.strength}) ${trimLine(record.summary)}`)
}

export function buildInterpretMessageSystemPrompt() {
  return [
    "You are Buddy's learner interpretation engine.",
    "Interpret the learner message semantically, not with deterministic keyword rules.",
    "Return strict JSON matching the schema.",
    "If this message does not justify learner-state mutation, set disposition='abstain'.",
    "Set replyMode to one of: reply-only, update-state, ask-question.",
    "Only include createEvidence/createMisconception when state mutation is justified by this message.",
  ].join("\n")
}

export function buildInterpretMessageUserPrompt(input: {
  snapshot: LearnerSnapshot
  message: string
  focusGoalIds: string[]
  sessionId?: string
}) {
  return [
    "Interpret this learner message in context.",
    "",
    `Workspace: ${input.snapshot.workspace.label}`,
    `Session: ${input.sessionId ?? "unknown"}`,
    `Focus goal IDs: ${input.focusGoalIds.length > 0 ? input.focusGoalIds.join(", ") : "none provided"}`,
    "",
    "Active goals:",
    ...goalLines(input.snapshot),
    "",
    "Open feedback:",
    ...feedbackLines(input.snapshot),
    "",
    "Active misconceptions:",
    ...misconceptionLines(input.snapshot),
    "",
    "Recent evidence:",
    ...evidenceLines(input.snapshot),
    "",
    "Learner message:",
    input.message,
  ].join("\n")
}

export function buildPlanSystemPrompt() {
  return [
    "You are Buddy's learner planning engine.",
    "Choose the next best learning move using current learner artifacts.",
    "Do not use deterministic scorecards or heuristic sequencing.",
    "If evidence is insufficient, you may abstain.",
    "When applying, output a concrete plan aligned to current goals and constraints.",
  ].join("\n")
}

export function buildPlanUserPrompt(input: {
  snapshot: LearnerSnapshot
  focusGoalIds: string[]
  sessionId?: string
}) {
  const bundleLines = input.snapshot.activityBundles.slice(0, 12).map((bundle) =>
    `- ${bundle.id}: ${bundle.label} (${bundle.intent})`,
  )

  return [
    "Create the next learning plan decision.",
    "",
    `Workspace: ${input.snapshot.workspace.label}`,
    `Session: ${input.sessionId ?? "unknown"}`,
    `Focus goal IDs: ${input.focusGoalIds.length > 0 ? input.focusGoalIds.join(", ") : "none provided"}`,
    "",
    "Available activity bundles:",
    ...(bundleLines.length > 0 ? bundleLines : ["- none"]),
    "",
    "Snapshot markdown:",
    input.snapshot.markdown,
  ].join("\n")
}

export function buildFeedbackSystemPrompt(input: {
  source: "practice" | "assessment"
}) {
  return [
    `You are Buddy's ${input.source} feedback decision engine.`,
    "Decide whether to emit a new feedback record and whether existing feedback should close.",
    "Use only evidence in provided context.",
    "Do not infer closure unless the latest artifact explicitly supports it.",
    "Return strict JSON matching the schema.",
  ].join("\n")
}

export function buildFeedbackUserPrompt(input: {
  snapshot: LearnerSnapshot
  source: "practice" | "assessment"
  summary: string
  outcome: string
  goalIds: string[]
}) {
  return [
    `Source: ${input.source}`,
    `Outcome: ${input.outcome}`,
    `Goal IDs: ${input.goalIds.join(", ")}`,
    "",
    "Latest artifact summary:",
    input.summary,
    "",
    "Open feedback:",
    ...feedbackLines(input.snapshot),
    "",
    "Active misconceptions:",
    ...misconceptionLines(input.snapshot),
    "",
    "Recent evidence:",
    ...evidenceLines(input.snapshot),
    "",
    "Snapshot:",
    input.snapshot.markdown,
  ].join("\n")
}
