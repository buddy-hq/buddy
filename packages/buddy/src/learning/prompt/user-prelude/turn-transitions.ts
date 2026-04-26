import type { PromptTurnSnapshot } from "../context"
import { defineTurnReminder } from "./definition"

function isExecutionFocusedState(state: PromptTurnSnapshot): boolean {
  return state.workspaceState === "interactive"
}

function buildFocusShiftReminder(input: {
  priorTurn: PromptTurnSnapshot
  currentTurn: PromptTurnSnapshot
}): string | undefined {
  const previousExecutionFocused = isExecutionFocusedState(input.priorTurn)
  const currentExecutionFocused = isExecutionFocusedState(input.currentTurn)
  if (previousExecutionFocused === currentExecutionFocused) return undefined

  return currentExecutionFocused
    ? "Teaching focus switch: concept-first -> execution-focused. Use practice, assessment, and editor tools when they materially help."
    : "Teaching focus switch: execution-focused -> concept-first. Avoid workspace mutation unless the learner explicitly asks for hands-on execution."
}

function buildPersonaTransition(
  prior: PromptTurnSnapshot,
  current: PromptTurnSnapshot,
): string | undefined {
  if (prior.persona === current.persona) return undefined
  return `Persona switch: ${prior.persona} -> ${current.persona}.`
}

function buildWorkspaceTransition(
  prior: PromptTurnSnapshot,
  current: PromptTurnSnapshot,
): string | undefined {
  if (prior.workspaceState === current.workspaceState) return undefined
  return current.workspaceState === "interactive"
    ? "Workspace switch: chat -> interactive. Ground help in the active lesson files."
    : "Workspace switch: interactive -> chat. Continue in chat unless the learner explicitly asks to use the editor."
}

function buildTurnTransitionLines(input: {
  priorTurn: PromptTurnSnapshot
  currentTurn: PromptTurnSnapshot
}): string[] {
  const focusShift = buildFocusShiftReminder(input)
  const persona = buildPersonaTransition(input.priorTurn, input.currentTurn)
  const workspace = buildWorkspaceTransition(input.priorTurn, input.currentTurn)

  return [focusShift, persona, workspace].filter((line): line is string => line != null)
}

export const turnTransitionReminder = defineTurnReminder({
  key: "turn-transition",
  when: (context) => context.priorTurn !== undefined,
  render: (context) => {
    if (!context.priorTurn) {
      return undefined
    }
    return buildTurnTransitionLines({
      priorTurn: context.priorTurn,
      currentTurn: context.currentTurn,
    })
  },
})
