import { detectPlatform, parseHotkey } from "@tanstack/react-hotkeys"

export type ComposerKeyState = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
  rightCommandPressed?: boolean
  physicalShiftPressed?: boolean
  physicalAltPressed?: boolean
}

export function isRightCommandKey(event: Pick<KeyboardEvent, "key" | "code" | "location">) {
  return event.code === "MetaRight" || (event.key === "Meta" && event.location === 2)
}

export function shouldSubmitComposer(
  state: ComposerKeyState,
  platform: ReturnType<typeof detectPlatform> = detectPlatform(),
) {
  if (state.isComposing) {
    return false
  }

  if (state.key !== "Enter") {
    return false
  }

  // A right Command keydown can reach macOS with other modifier flags set by a
  // keyboard remapper. The matching keydown is stronger evidence than those flags.
  if (platform === "mac" && state.rightCommandPressed && state.metaKey) {
    return !state.physicalShiftPressed && !state.physicalAltPressed
  }

  if (state.shiftKey || state.altKey) return false

  if (!state.ctrlKey && !state.metaKey) return true

  const sendShortcut = parseHotkey("Mod+Enter", platform)
  return state.ctrlKey === sendShortcut.ctrl && state.metaKey === sendShortcut.meta
}
