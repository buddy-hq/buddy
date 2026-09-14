import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys"
import { useEffect, useRef } from "react"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import {
  CHAT_JUMP_SHORTCUTS,
  SHORTCUTS,
  shouldRunShortcut,
  type ShortcutCommand,
} from "@/lib/shortcuts"

/** Dispatched on `window` by the desktop renderer when a native menu item is clicked. */
const MENU_COMMAND_EVENT = "buddy:menu-command"

/**
 * Cmd/Ctrl chords still fire from text fields, so shortcuts work while typing in the composer.
 * Default handling happens in the callbacks, so a key that is skipped keeps its own meaning. Held
 * keys are skipped through `event.repeat` rather than the library's `requireReset`, which only
 * re-arms on a keyup and so misses the next press when the window lost focus mid-chord.
 */
const HOTKEY_OPTIONS = { preventDefault: false, stopPropagation: false }

type ShortcutCommandOptions = {
  /** Leave the key alone while focus is inside an element matching this selector. */
  ignoreWithin?: string
  /** When false, neither the key nor the menu item is handled here. Defaults to true. */
  enabled?: boolean
  /** Receives synchronous throws and rejected promises from the command handler. */
  onError?: (error: Error) => void
}

function normalizeShortcutError<TCause>(cause: TCause): Error {
  return cause instanceof Error
    ? cause
    : new Error("Shortcut command failed with a non-Error value", { cause })
}

function reportShortcutError(command: string, error: Error): void {
  console.error(`Shortcut command "${command}" failed`, error)
}

function invokeShortcutHandler(
  command: string,
  handler: () => void | Promise<void>,
  onError?: (error: Error) => void,
): void {
  const reportError = onError ?? ((error: Error) => reportShortcutError(command, error))
  try {
    void Promise.resolve(handler()).catch((cause) => reportError(normalizeShortcutError(cause)))
  } catch (cause) {
    reportError(normalizeShortcutError(cause))
  }
}

/** Runs `handler` when the command's key is pressed or its native menu item is clicked. */
export function useShortcutCommand(
  command: ShortcutCommand,
  handler: () => void | Promise<void>,
  options: ShortcutCommandOptions = {},
) {
  const { ignoreWithin, enabled = true } = options
  const handlerRef = useRef(handler)
  const onErrorRef = useRef(options.onError)
  handlerRef.current = handler
  onErrorRef.current = options.onError

  useHotkey(
    SHORTCUTS[command],
    (event) => {
      if (event.repeat || !shouldRunShortcut(event, ignoreWithin)) return
      event.preventDefault()
      invokeShortcutHandler(command, handlerRef.current, onErrorRef.current)
    },
    { ...HOTKEY_OPTIONS, enabled },
  )

  useEffect(() => {
    if (!enabled) return

    function onMenuCommand(event: Event) {
      if (!(event instanceof CustomEvent)) return
      if (parseTJsonObject(event.detail)?.id !== command) return
      invokeShortcutHandler(command, handlerRef.current, onErrorRef.current)
    }

    window.addEventListener(MENU_COMMAND_EVENT, onMenuCommand)
    return () => window.removeEventListener(MENU_COMMAND_EVENT, onMenuCommand)
  }, [command, enabled])
}

/**
 * Runs `handler` with the zero-based position when Mod+1 … Mod+9 is pressed. Only the first
 * `count` keys are handled, so a key with no chat behind it keeps its own meaning.
 */
export function useChatJumpShortcuts(
  handler: (index: number) => void | Promise<void>,
  options: { count: number; onError?: (error: Error) => void },
) {
  const handlerRef = useRef(handler)
  const onErrorRef = useRef(options.onError)
  handlerRef.current = handler
  onErrorRef.current = options.onError

  useHotkeys(
    CHAT_JUMP_SHORTCUTS.map((shortcut, index) => ({
      hotkey: shortcut.hotkey,
      callback: (event: KeyboardEvent) => {
        if (event.repeat || !shouldRunShortcut(event)) return
        event.preventDefault()
        invokeShortcutHandler(
          shortcut.command,
          () => handlerRef.current(index),
          onErrorRef.current,
        )
      },
      options: { enabled: index < options.count },
    })),
    HOTKEY_OPTIONS,
  )

  useEffect(() => {
    function onMenuCommand(event: Event) {
      if (!(event instanceof CustomEvent)) return
      const command = parseTString(parseTJsonObject(event.detail)?.id)
      if (!command) return
      const index = CHAT_JUMP_SHORTCUTS.findIndex((shortcut) => shortcut.command === command)
      if (index < 0 || index >= options.count) return
      invokeShortcutHandler(command, () => handlerRef.current(index), onErrorRef.current)
    }

    window.addEventListener(MENU_COMMAND_EVENT, onMenuCommand)
    return () => window.removeEventListener(MENU_COMMAND_EVENT, onMenuCommand)
  }, [options.count])
}
