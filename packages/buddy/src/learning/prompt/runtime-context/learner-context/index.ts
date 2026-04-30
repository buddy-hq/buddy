import LEARNER_FEEDBACK_CONTEXT_TEMPLATE_SOURCE from "./learner-feedback-context.t.md"
import LEARNER_PROGRESS_CONTEXT_TEMPLATE_SOURCE from "./learner-progress-context.t.md"
import LEARNER_STATE_CONTEXT_TEMPLATE_SOURCE from "./learner-state-context.t.md"
import { defineRuntimeSection } from "../definition"
import type { RuntimeSectionContext } from "../definition"
import { definePromptTemplate } from "../../template/engine"

type LearnerMemoryContext = Pick<RuntimeSectionContext, "learnerSnapshot">

const LEARNER_STATE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: LEARNER_STATE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/learner-context/learner-state-context.t.md",
})
const LEARNER_PROGRESS_CONTEXT_TEMPLATE = definePromptTemplate({
  source: LEARNER_PROGRESS_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/learner-context/learner-progress-context.t.md",
})
const LEARNER_FEEDBACK_CONTEXT_TEMPLATE = definePromptTemplate({
  source: LEARNER_FEEDBACK_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/learner-context/learner-feedback-context.t.md",
})

function compactLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function renderLearnerStateContext(context: LearnerMemoryContext) {
  const snapshot = context.learnerSnapshot
  const relevantGoalIds = snapshot.goals.map((goal) => goal.id)
  const summaryBodyLines = [
    relevantGoalIds.length > 0
      ? `Relevant goals: ${relevantGoalIds.join(", ")}`
      : "No relevant goals exist yet. Define goals before sequencing practice.",
    ...snapshot.goals.slice(0, 6).map((goal) => `- ${goal.statement} [test: ${goal.howToTest}]`),
    ...snapshot.constraintsSummary.map((line) => `- Constraint: ${compactLine(line)}`),
  ]

  return LEARNER_STATE_CONTEXT_TEMPLATE.render({
    workspace: snapshot.workspace.label,
    body_lines: summaryBodyLines.join("\n"),
  })
}

function renderLearnerProgressContext(context: LearnerMemoryContext) {
  const snapshot = context.learnerSnapshot
  const progressLines = [
    `Goals in scope: ${snapshot.goals.length}`,
    `Evidence records: ${snapshot.recentEvidence.length}`,
    `Open feedback items: ${snapshot.openFeedback.length}`,
    `Active misconceptions: ${snapshot.activeMisconceptions.length}`,
  ]

  return LEARNER_PROGRESS_CONTEXT_TEMPLATE.render({
    progress_lines: progressLines.map((line) => `- ${compactLine(line)}`).join("\n"),
  })
}

function renderLearnerFeedbackContext(context: LearnerMemoryContext) {
  const snapshot = context.learnerSnapshot
  const openFeedbackLines = snapshot.openFeedback
    .map((record) => compactLine(record.requiredAction))
    .slice(0, 8)
  const misconceptionLines = snapshot.activeMisconceptions
    .map((record) => compactLine(record.summary))
    .slice(0, 8)

  const feedbackLines = [
    ...(openFeedbackLines.length > 0
      ? openFeedbackLines.map((line) => `- ${line}`)
      : ["- No open feedback actions."]),
    ...(misconceptionLines.length > 0
      ? misconceptionLines.map((line) => `- Misconception: ${line}`)
      : ["- No active misconceptions."]),
  ]

  return LEARNER_FEEDBACK_CONTEXT_TEMPLATE.render({
    feedback_lines: feedbackLines.join("\n"),
  })
}

function renderLearnerMemoryRuntimePrelude(context: LearnerMemoryContext): string {
  return [
    renderLearnerStateContext(context),
    renderLearnerProgressContext(context),
    renderLearnerFeedbackContext(context),
  ].join("\n\n")
}

export const learnerSummarySection = defineRuntimeSection({
  key: "learner-summary",
  render: renderLearnerStateContext,
})

export const learnerProgressSection = defineRuntimeSection({
  key: "learner-progress",
  render: renderLearnerProgressContext,
})

export const learnerFeedbackSection = defineRuntimeSection({
  key: "learner-feedback",
  render: renderLearnerFeedbackContext,
})

export { renderLearnerMemoryRuntimePrelude }
