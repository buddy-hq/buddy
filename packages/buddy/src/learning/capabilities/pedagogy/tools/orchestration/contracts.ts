import type { Intent } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { GoalArtifact } from "../../../../learner-model/repository/types"

export type PedagogyToolParams = {
  goalIds: string[]
  topic?: string
  learnerRequest?: string
  conceptA?: string
  conceptB?: string
  analogyDomain?: string
}

export type PedagogyToolContext = {
  workspaceLabel: string
  persona: string
  intent: Intent
  goalIds: string[]
  goals: GoalArtifact[]
  learnerSummaryLines: string[]
}
