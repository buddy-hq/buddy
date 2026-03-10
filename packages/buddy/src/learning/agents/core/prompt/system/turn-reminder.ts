import type {
  ActivityBundleCapability,
} from "../../runtime/types"
import { hasText } from "../../shared/text"
import type { PromptRuntimeState } from "../../shared/teaching-session-state"

function isExecutionFocusedState(state: PromptRuntimeState): boolean {
  if (state.intentOverride === "learn") return false
  if (state.intentOverride === "practice" || state.intentOverride === "assess") return true
  return state.persona !== "buddy"
}

function buildFocusShiftReminder(input: {
  previousState?: PromptRuntimeState
  currentState: PromptRuntimeState
}): string | undefined {
  if (!input.previousState) return undefined

  const previousExecutionFocused = isExecutionFocusedState(input.previousState)
  const currentExecutionFocused = isExecutionFocusedState(input.currentState)
  if (previousExecutionFocused === currentExecutionFocused) return undefined

  return currentExecutionFocused
    ? "Teaching focus switch: concept-first -> execution-focused. Use practice, assessment, and editor tools when they materially help."
    : "Teaching focus switch: execution-focused -> concept-first. Avoid workspace mutation unless the learner explicitly asks for hands-on execution."
}

export function buildTurnReminder(input: {
  previousState?: PromptRuntimeState
  currentState: PromptRuntimeState
  activityBundle?: ActivityBundleCapability
  changedSinceCheckpoint?: boolean
}) {
  const focusShift = buildFocusShiftReminder({
    previousState: input.previousState,
    currentState: input.currentState,
  })

  const personaTransition =
    input.previousState && input.previousState.persona !== input.currentState.persona
      ? `Persona switch: ${input.previousState.persona} -> ${input.currentState.persona}.`
      : undefined

  const intentTransition =
    input.previousState && (input.previousState.intentOverride ?? "auto") !== (input.currentState.intentOverride ?? "auto")
      ? `Intent switch: ${input.previousState.intentOverride ?? "auto"} -> ${input.currentState.intentOverride ?? "auto"}.`
      : undefined

  const workspaceTransition =
    input.previousState && input.previousState.workspaceState !== input.currentState.workspaceState
      ? input.currentState.workspaceState === "interactive"
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
