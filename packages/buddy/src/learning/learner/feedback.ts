import type {
  AssessmentRecord,
  FeedbackRecord,
  OpenFeedbackAction,
  PracticeAttempt,
} from "./types.js"
import type { ScaffoldingLevel } from "../runtime/types.js"

function firstOrFallback(values: string[], fallback: string) {
  return values.find((value) => value.trim().length > 0) ?? fallback
}

function compact(values: Array<string | undefined>): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => !!value)
}

function scaffoldingForPracticeOutcome(
  outcome: PracticeAttempt["outcome"],
  difficulty?: "scaffolded" | "moderate" | "stretch",
): ScaffoldingLevel {
  if (outcome === "stuck") return "worked-example"
  if (outcome === "partial") return "guided"
  if (difficulty === "stretch") return "independent"
  return outcome === "completed" ? "independent" : "guided"
}

export function buildPracticeFeedback(input: {
  goalIds: string[]
  learnerResponseSummary: string
  outcome: PracticeAttempt["outcome"]
  targetComponents: string[]
  difficulty?: "scaffolded" | "moderate" | "stretch"
}): {
  strengths: string[]
  gaps: string[]
  guidance: string[]
  requiredAction: string
  scaffoldingLevel: ScaffoldingLevel
  pattern?: string
} {
  const strengths =
    input.outcome === "completed"
      ? compact([
          "You carried the practice through to a full attempt.",
          input.targetComponents.length > 0
            ? `You engaged the expert-thinking components around ${input.targetComponents.join(", ")}.`
            : undefined,
        ])
      : compact([
          input.outcome === "partial" ? "You made real forward progress instead of stopping at the first gap." : undefined,
          input.outcome === "assigned" ? "You have a clear task to work on next." : undefined,
        ])

  const gaps =
    input.outcome === "completed"
      ? compact([
          input.difficulty !== "stretch"
            ? "This was successful, but it should now transfer to a less scaffolded variation."
            : undefined,
        ])
      : compact([
          input.outcome === "partial" ? "The reasoning is incomplete or not yet stable end to end." : undefined,
          input.outcome === "stuck" ? "The task currently exceeds the learner's independent working range." : undefined,
          input.outcome === "assigned" ? "No learner evidence exists yet for this task." : undefined,
        ])

  const guidance =
    input.outcome === "completed"
      ? compact([
          "Tighten the self-check so the learner verifies why the result is correct, not just that it worked.",
          input.targetComponents.length > 0
            ? `Ask for a short explanation of how ${input.targetComponents[0]} affected the solution.`
            : undefined,
        ])
      : compact([
          input.outcome === "partial" ? "Keep the task live, but reduce the next step to one concrete decision or check." : undefined,
          input.outcome === "stuck" ? "Switch to a worked example or guided practice before returning to independence." : undefined,
          input.outcome === "assigned" ? "Prompt the learner to attempt the task and show their reasoning, not just the final answer." : undefined,
        ])

  const requiredAction = firstOrFallback(
    compact([
      input.outcome === "completed"
        ? "Do one transfer variation and explain what would break if the key assumption changed."
        : undefined,
      input.outcome === "partial"
        ? "Revise the attempt using one targeted fix, then explain why that fix addresses the gap."
        : undefined,
      input.outcome === "stuck"
        ? "Work through one guided step, then retry the next step independently."
        : undefined,
      input.outcome === "assigned"
        ? "Attempt the task and include a short self-check for how you would validate the result."
        : undefined,
    ]),
    "Attempt the next step and explain the reasoning behind it.",
  )

  return {
    strengths,
    gaps,
    guidance,
    requiredAction,
    scaffoldingLevel: scaffoldingForPracticeOutcome(input.outcome, input.difficulty),
    pattern: input.outcome === "stuck" ? "challenge exceeds current scaffolding level" : undefined,
  }
}

export function buildAssessmentFeedback(input: {
  format: AssessmentRecord["format"]
  summary: string
  result: AssessmentRecord["result"]
  evidenceCriteria: string[]
  followUpAction?: string
}): {
  strengths: string[]
  gaps: string[]
  guidance: string[]
  requiredAction: string
  scaffoldingLevel: ScaffoldingLevel
  pattern?: string
} {
  const strengths =
    input.result === "demonstrated"
      ? compact([
          "The learner produced evidence that matches the current mastery check.",
          input.evidenceCriteria[0] ? `The work met criteria around ${input.evidenceCriteria[0]}.` : undefined,
        ])
      : compact([
          input.result === "partial" ? "There is partial understanding to build on." : undefined,
        ])

  const gaps =
    input.result === "demonstrated"
      ? ["Mastery still needs to hold under a different surface form over time."]
      : compact([
          input.result === "partial" ? "The learner can do part of the work, but cannot yet carry the whole goal independently." : undefined,
          input.result === "not-demonstrated" ? "The learner has not yet demonstrated the goal under the current assessment format." : undefined,
        ])

  const requiredAction = input.followUpAction?.trim().length
    ? input.followUpAction
    : input.result === "demonstrated"
      ? "Do one varied mastery check later to confirm transfer and retention."
      : input.result === "partial"
        ? "Redo the check after one targeted practice round that addresses the missing step."
        : "Return to guided practice on the same goal before attempting another mastery check."

  return {
    strengths,
    gaps,
    guidance: compact([
      input.result === "demonstrated"
        ? "Vary the surface features next time so the learner must transfer, not pattern-match."
        : "Use the assessment result to choose the smallest next practice task that attacks the real gap.",
      input.evidenceCriteria.length > 0
        ? `Ground the follow-up in these criteria: ${input.evidenceCriteria.join(", ")}.`
        : undefined,
    ]),
    requiredAction,
    scaffoldingLevel: input.result === "demonstrated" ? "transfer" : input.result === "partial" ? "guided" : "worked-example",
    pattern: input.result === "not-demonstrated" ? `assessment gap in ${input.format}` : undefined,
  }
}

export function buildOpenFeedbackActions(records: FeedbackRecord[]): OpenFeedbackAction[] {
  return records
    .filter((record) => record.status === "open")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((record) => ({
      feedbackId: record.feedbackId,
      goalIds: [...record.goalIds],
      requiredAction: record.requiredAction,
      scaffoldingLevel: record.scaffoldingLevel,
      pattern: record.pattern,
      createdAt: record.createdAt,
    }))
}
