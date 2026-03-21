import { shouldSubmitComposer } from "../../lib/chat-input"

export type PromptSubmitAction = "submit" | "abort" | "none"

type PromptSubmitInput = {
  value: () => string
  isBusy: () => boolean
  onSubmit: () => void
  onAbort: () => void
}

type PromptSubmitEvent = {
  preventDefault: () => void
}

type PromptKeydownEvent = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
  preventDefault: () => void
}

export function promptSubmitAction(input: { isBusy: boolean; value: string }): PromptSubmitAction {
  if (input.isBusy) return "abort"
  if (!input.value.trim()) return "none"
  return "submit"
}

export function createPromptSubmit(input: PromptSubmitInput) {
  const run = (): PromptSubmitAction => {
    const action = promptSubmitAction({
      isBusy: input.isBusy(),
      value: input.value(),
    })

    if (action === "submit") input.onSubmit()
    if (action === "abort") input.onAbort()
    return action
  }

  return {
    handleSubmit(event: PromptSubmitEvent): PromptSubmitAction {
      event.preventDefault()
      return run()
    },
    handleKeyDown(event: PromptKeydownEvent): PromptSubmitAction {
      if (
        !shouldSubmitComposer({
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing: event.isComposing,
        })
      ) {
        return "none"
      }
      event.preventDefault()
      return run()
    },
  }
}
