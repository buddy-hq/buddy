import type { PromptContext, PromptTurnSnapshot } from "../context"
import type { LearnerContextDelivery } from "../../shared/learner-context-delivery"

export type TurnReminderContext = PromptContext & {
  changedSinceCheckpoint?: boolean
  currentTurn: PromptTurnSnapshot
  learnerContextDelivery?: LearnerContextDelivery
}

export type TurnReminderDefinition = {
  key: string
  when?: (context: TurnReminderContext) => boolean
  render: (context: TurnReminderContext) => string | readonly string[] | undefined
}

export function defineTurnReminder<const T extends TurnReminderDefinition>(definition: T): T {
  return definition
}
