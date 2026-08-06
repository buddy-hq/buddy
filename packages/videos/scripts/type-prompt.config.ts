const typePromptTiming = {
  pauseMilliseconds: {
    long: 800,
    none: 0,
    short: 400,
  },
} as const

type PauseLength = keyof typeof typePromptTiming.pauseMilliseconds

type TypePromptConfig = {
  readonly appName: string
  readonly interactive: {
    readonly cancellationMessage: string
    readonly promptSelectionMessage: string
    readonly submitConfirmationMessage: string
    readonly submitDefault: boolean
  }
  readonly timing: {
    readonly beforeSubmit: PauseLength
    readonly beforeTyping: PauseLength
    readonly wordsPerMinute: number
  }
}

// These are the controls to adjust for recordings.
export const typePromptConfig: TypePromptConfig = {
  appName: "Buddy",
  timing: {
    beforeSubmit: "none",
    beforeTyping: "short",
    wordsPerMinute: 500,
  },
  interactive: {
    cancellationMessage: "No prompt was typed.",
    promptSelectionMessage: "Choose a prompt to type into Buddy",
    submitConfirmationMessage: "Submit the prompt after typing?",
    submitDefault: false,
  },
}

export { typePromptTiming }
