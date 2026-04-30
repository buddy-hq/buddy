import type { PromptContext, PromptTurnSnapshot } from "../context"
import {
  buildLearnerContextView,
  decideLearnerContextDelivery,
} from "../../shared/learner-context-delivery"
import { hasText } from "../utils"
import { activeResourceReminder } from "./active-resource-reminder"
import { checkpointReminder } from "./checkpoint-reminder"
import type { TurnReminderDefinition, TurnReminderContext } from "./definition"
import { learnerMemoryReminder } from "./learner-memory-reminder"
import { turnTransitionReminder } from "./turn-transitions"

export type BuddyUserPreludePart = {
  type: "text"
  text: string
  synthetic: true
}

const TURN_REMINDERS: readonly TurnReminderDefinition[] = [
  learnerMemoryReminder,
  turnTransitionReminder,
  checkpointReminder,
  activeResourceReminder,
]

export function buildBuddyUserPrelude(input: {
  context: PromptContext
  changedSinceCheckpoint?: boolean
}): readonly BuddyUserPreludePart[] {
  const learnerContextView = buildLearnerContextView(input.context.learnerSnapshot)
  const learnerContextDelivery = decideLearnerContextDelivery({
    current: {
      ...learnerContextView,
      fingerprint: input.context.learnerContextDigest ?? learnerContextView.fingerprint,
    },
    previousFingerprint: input.context.priorLearnerContextDigest,
    previousItems: input.context.priorLearnerContextItems,
  })
  const currentTurn = {
    persona: input.context.persona,
    workspaceState: input.context.workspaceState,
  } satisfies PromptTurnSnapshot

  const reminderContext: TurnReminderContext = {
    ...input.context,
    changedSinceCheckpoint: input.changedSinceCheckpoint,
    currentTurn,
    learnerContextDelivery,
  }

  const reminderLines = TURN_REMINDERS.flatMap((definition) => {
    if (definition.when && !definition.when(reminderContext)) {
      return []
    }
    const rendered = definition.render(reminderContext)
    if (!rendered) {
      return []
    }
    if (Array.isArray(rendered)) {
      return rendered.filter((line): line is string => hasText(line))
    }
    return typeof rendered === "string" && hasText(rendered) ? [rendered] : []
  })

  if (reminderLines.length === 0) return []

  return [
    {
      type: "text",
      text: `<system-reminder>\n${reminderLines.join("\n")}\n</system-reminder>`,
      synthetic: true,
    },
  ]
}
