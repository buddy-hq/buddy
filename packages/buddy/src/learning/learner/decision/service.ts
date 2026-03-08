import type { LearnerSnapshot } from "../compiler/snapshot.js"
import { runStructuredDecision } from "./engine.js"
import {
  type FeedbackDecision,
  FeedbackDecisionSchema,
  FeedbackJsonSchema,
  type InterpretMessageDecision,
  InterpretMessageDecisionSchema,
  InterpretMessageJsonSchema,
  type PlanDecision,
  PlanDecisionSchema,
  PlanJsonSchema,
} from "./types.js"
import {
  buildInterpretMessageSystemPrompt,
  buildInterpretMessageUserPrompt,
  buildFeedbackSystemPrompt,
  buildFeedbackUserPrompt,
  buildPlanSystemPrompt,
  buildPlanUserPrompt,
} from "./prompt.js"

export namespace LearnerDecisionService {
  export async function interpretMessage(input: {
    directory: string
    snapshot: LearnerSnapshot
    message: string
    focusGoalIds: string[]
    sessionId?: string
  }) {
    return runStructuredDecision<InterpretMessageDecision>({
      directory: input.directory,
      title: "Learner interpretation",
      system: buildInterpretMessageSystemPrompt(),
      prompt: buildInterpretMessageUserPrompt({
        snapshot: input.snapshot,
        message: input.message,
        focusGoalIds: input.focusGoalIds,
        sessionId: input.sessionId,
      }),
      schema: InterpretMessageDecisionSchema,
      jsonSchema: InterpretMessageJsonSchema,
      sessionId: input.sessionId,
    })
  }

  export async function planSession(input: {
    directory: string
    snapshot: LearnerSnapshot
    focusGoalIds: string[]
    sessionId?: string
  }) {
    return runStructuredDecision<PlanDecision>({
      directory: input.directory,
      title: "Learner plan decision",
      system: buildPlanSystemPrompt(),
      prompt: buildPlanUserPrompt({
        snapshot: input.snapshot,
        focusGoalIds: input.focusGoalIds,
        sessionId: input.sessionId,
      }),
      schema: PlanDecisionSchema,
      jsonSchema: PlanJsonSchema,
      sessionId: input.sessionId,
    })
  }

  export async function generatePracticeFeedback(input: {
    directory: string
    snapshot: LearnerSnapshot
    goalIds: string[]
    summary: string
    outcome: "assigned" | "partial" | "completed" | "stuck"
    sessionId?: string
  }) {
    return runStructuredDecision<FeedbackDecision>({
      directory: input.directory,
      title: "Learner practice feedback decision",
      system: buildFeedbackSystemPrompt({
        source: "practice",
      }),
      prompt: buildFeedbackUserPrompt({
        snapshot: input.snapshot,
        source: "practice",
        summary: input.summary,
        outcome: input.outcome,
        goalIds: input.goalIds,
      }),
      schema: FeedbackDecisionSchema,
      jsonSchema: FeedbackJsonSchema,
      sessionId: input.sessionId,
    })
  }

  export async function generateAssessmentFeedback(input: {
    directory: string
    snapshot: LearnerSnapshot
    goalIds: string[]
    summary: string
    outcome: "demonstrated" | "partial" | "not-demonstrated"
    sessionId?: string
  }) {
    return runStructuredDecision<FeedbackDecision>({
      directory: input.directory,
      title: "Learner assessment feedback decision",
      system: buildFeedbackSystemPrompt({
        source: "assessment",
      }),
      prompt: buildFeedbackUserPrompt({
        snapshot: input.snapshot,
        source: "assessment",
        summary: input.summary,
        outcome: input.outcome,
        goalIds: input.goalIds,
      }),
      schema: FeedbackDecisionSchema,
      jsonSchema: FeedbackJsonSchema,
      sessionId: input.sessionId,
    })
  }
}
