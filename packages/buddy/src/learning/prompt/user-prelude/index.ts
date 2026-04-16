import type { PromptContext, PromptTurnSnapshot } from "../context"
import { hasText } from "../utils"
import { checkpointReminder } from "./checkpoint-reminder"
import type { TurnReminderDefinition, TurnReminderContext } from "./definition"
import { turnTransitionReminder } from "./turn-transitions"

export type BuddyUserPreludePart = {
  type: "text"
  text: string
  synthetic: true
}

const TURN_REMINDERS: readonly TurnReminderDefinition[] = [
  turnTransitionReminder,
  checkpointReminder,
]

export function buildBuddyUserPrelude(input: {
  context: PromptContext
  changedSinceCheckpoint?: boolean
}): readonly BuddyUserPreludePart[] {
  const currentTurn = {
    persona: input.context.persona,
    intent: input.context.intent,
    workspaceState: input.context.workspaceState,
  } satisfies PromptTurnSnapshot

  const reminderContext: TurnReminderContext = {
    ...input.context,
    changedSinceCheckpoint: input.changedSinceCheckpoint,
    currentTurn,
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
