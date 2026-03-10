import type { ActivityBundleCapability } from "../shared/runtime-types"
import { hasText } from "./utils"
import type { PromptTurnSnapshot } from "./prompt-context"

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

export function buildTurnPrompt(input: {
  priorTurn?: PromptTurnSnapshot
  currentTurn: PromptTurnSnapshot
  activityBundle?: ActivityBundleCapability
  changedSinceCheckpoint?: boolean
}) {
  const focusShift = buildFocusShiftReminder({
    priorTurn: input.priorTurn,
    currentTurn: input.currentTurn,
  })

  const personaTransition =
    input.priorTurn && input.priorTurn.persona !== input.currentTurn.persona
      ? `Persona switch: ${input.priorTurn.persona} -> ${input.currentTurn.persona}.`
      : undefined

  const intentTransition =
    input.priorTurn && (input.priorTurn.intent ?? "auto") !== (input.currentTurn.intent ?? "auto")
      ? `Intent switch: ${input.priorTurn.intent ?? "auto"} -> ${input.currentTurn.intent ?? "auto"}.`
      : undefined

  const workspaceTransition =
    input.priorTurn && input.priorTurn.workspaceState !== input.currentTurn.workspaceState
      ? input.currentTurn.workspaceState === "interactive"
        ? "Workspace switch: chat -> interactive. Ground help in the active lesson files."
        : "Workspace switch: interactive -> chat. Continue in chat unless the learner explicitly asks to use the editor."
      : undefined

  const activityOverride = input.activityBundle
    ? `This turn has an explicit activity bundle override: ${input.activityBundle.label} (${input.activityBundle.id}). Treat it as primary unless the learner's message conflicts.`
    : undefined

  const checkpointReminder = input.changedSinceCheckpoint
    ? "There are unaccepted lesson changes since the last checkpoint. Verify before accepting progress."
    : undefined

  const reminderLines = [
    focusShift,
    personaTransition,
    intentTransition,
    workspaceTransition,
    activityOverride,
    checkpointReminder,
  ].filter(hasText)

  if (reminderLines.length === 0) return undefined

  return `<system-reminder>\n${reminderLines.join("\n")}\n</system-reminder>`
}
