import z from "zod"
import type { Intent } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { GoalArtifact } from "../../../../learner-model/repository/types"

export const PedagogyToolParameters = z.object({
  goalIds: z.array(z.string()).default([]),
  topic: z.string().optional(),
  learnerRequest: z.string().optional(),
  conceptA: z.string().optional(),
  conceptB: z.string().optional(),
  analogyDomain: z.string().optional(),
})

export type PedagogyToolParams = z.infer<typeof PedagogyToolParameters>

export type PedagogyToolContext = {
  workspaceLabel: string
  persona: string
  intent: Intent
  goalIds: string[]
  goals: GoalArtifact[]
  learnerSummaryLines: string[]
}
