import z from "zod"
import type { TeachingIntentId } from "../../../../core/runtime/vocabulary"
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
  intent?: TeachingIntentId
  goalIds: string[]
  goals: GoalArtifact[]
  tier1: string[]
  tier2: string[]
  tier3: string[]
}

type ActivityToolId = `activity_${string}`

export type ActivityToolDefinition<Id extends ActivityToolId = ActivityToolId> = {
  id: Id
  description: string
  intent: TeachingIntentId
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => string
}
