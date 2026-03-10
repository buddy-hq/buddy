import z from "zod"
import type { Intent } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { GoalArtifact } from "../../../../../learner-model"

export const ActivityToolParameters = z.object({
  goalIds: z.array(z.string()).default([]),
  topic: z.string().optional(),
  learnerRequest: z.string().optional(),
  conceptA: z.string().optional(),
  conceptB: z.string().optional(),
  analogyDomain: z.string().optional(),
})

export type ActivityToolParams = z.infer<typeof ActivityToolParameters>

export type ActivityToolContext = {
  workspaceLabel: string
  persona: string
  intent?: Intent
  goalIds: string[]
  goals: GoalArtifact[]
  learnerSummaryLines: string[]
}

type ActivityToolId = `activity_${string}`

export type ActivityToolDefinition<Id extends ActivityToolId = ActivityToolId> = {
  id: Id
  description: string
  intent: Intent
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => string
}
