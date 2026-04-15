import { hasText } from "./utils"
import type { BuddyPromptBuildContext, BuddyUserPreludePart, PromptTurnSnapshot } from "./contracts"

function isExecutionFocusedState(state: PromptTurnSnapshot): boolean {
  if (state.intent === "learn") return false
  if (state.intent === "practice" || state.intent === "assess") return true
  return state.persona !== "buddy"
}

function buildFocusShiftReminder(input: {
  priorTurn?: PromptTurnSnapshot
  currentTurn: PromptTurnSnapshot
}): string | undefined {
  if (!input.priorTurn) return undefined

  const previousExecutionFocused = isExecutionFocusedState(input.priorTurn)
  const currentExecutionFocused = isExecutionFocusedState(input.currentTurn)
  if (previousExecutionFocused === currentExecutionFocused) return undefined

  return currentExecutionFocused
    ? "Teaching focus switch: concept-first -> execution-focused. Use practice, assessment, and editor tools when they materially help."
    : "Teaching focus switch: execution-focused -> concept-first. Avoid workspace mutation unless the learner explicitly asks for hands-on execution."
}

function buildUserPreludeText(input: {
  priorTurn?: PromptTurnSnapshot
  currentTurn: PromptTurnSnapshot
  changedSinceCheckpoint?: boolean
}): string | undefined {
  const focusShift = buildFocusShiftReminder({
    priorTurn: input.priorTurn,
    currentTurn: input.currentTurn,
  })

  const personaTransition =
    input.priorTurn && input.priorTurn.persona !== input.currentTurn.persona
      ? `Persona switch: ${input.priorTurn.persona} -> ${input.currentTurn.persona}.`
      : undefined

  const intentTransition =
    input.priorTurn && input.priorTurn.intent !== input.currentTurn.intent
      ? `Intent switch: ${input.priorTurn.intent} -> ${input.currentTurn.intent}.`
      : undefined

  const workspaceTransition =
    input.priorTurn && input.priorTurn.workspaceState !== input.currentTurn.workspaceState
      ? input.currentTurn.workspaceState === "interactive"
        ? "Workspace switch: chat -> interactive. Ground help in the active lesson files."
        : "Workspace switch: interactive -> chat. Continue in chat unless the learner explicitly asks to use the editor."
      : undefined

  const checkpointReminder = input.changedSinceCheckpoint
    ? "There are unaccepted lesson changes since the last checkpoint. Verify before accepting progress."
    : undefined

  const reminderLines = [
    focusShift,
    personaTransition,
    intentTransition,
    workspaceTransition,
    checkpointReminder,
  ].filter(hasText)

  if (reminderLines.length === 0) return undefined

  return `<system-reminder>\n${reminderLines.join("\n")}\n</system-reminder>`
}

export function buildBuddyUserPrelude(input: {
  context: BuddyPromptBuildContext
  changedSinceCheckpoint?: boolean
}): readonly BuddyUserPreludePart[] {
  const currentTurn: PromptTurnSnapshot = {
    persona: input.context.persona,
    intent: input.context.intent,
    workspaceState: input.context.teachingContext?.active ? "interactive" : "chat",
  }
  const text = buildUserPreludeText({
    priorTurn: input.context.priorTurn,
    currentTurn,
    changedSinceCheckpoint: input.changedSinceCheckpoint,
  })

  return text
    ? [
        {
          type: "text",
          text,
          synthetic: true,
        },
      ]
    : []
}
