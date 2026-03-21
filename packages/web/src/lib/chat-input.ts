export type ComposerKeyState = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
}

export function shouldSubmitComposer(state: ComposerKeyState) {
  if (state.isComposing) {
    return false
  }

  if (state.key !== "Enter") {
    return false
  }

  return !state.shiftKey && !state.ctrlKey && !state.metaKey && !state.altKey
}
