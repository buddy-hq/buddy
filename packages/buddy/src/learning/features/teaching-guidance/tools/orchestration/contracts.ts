import type { GoalRecord } from "../../../../features/memory/goals/storage"

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
  goalIds: string[]
  goals: GoalRecord[]
  learnerSummaryLines: string[]
}
