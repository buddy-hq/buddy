import { APP_SHORTCUTS, type AppShortcutID } from "@buddy/browser-contract"
import type { RegisterableHotkey } from "@tanstack/react-hotkeys"

/**
 * App-level keyboard shortcuts, one key per command. The macOS menu sends the same command ids
 * (`buddy:menu-command`), so a menu item and its key run one handler. `Mod` is Cmd on macOS and
 * Ctrl elsewhere.
 *
 * These fire from text fields too, but never from inside an open dialog or popover, and never for
 * a key a focused surface already handled (a reader's Mod+L, whiteboard text's Mod+Shift+[). A
 * chord an editor owns without cancelling it (Mod+B inside an editor dialog) is registered with
 * `ignoreWithin: BENCH_EDITOR_SELECTOR`. Avoid Mod+K, which the editors use for links.
 */
export const SHORTCUTS = {
  "chat.new": APP_SHORTCUTS["chat.new"],
  "chat.previous": APP_SHORTCUTS["chat.previous"],
  "chat.next": APP_SHORTCUTS["chat.next"],
  "composer.focus": APP_SHORTCUTS["composer.focus"],
  "search.open": APP_SHORTCUTS["search.open"],
  "bench.toggle": APP_SHORTCUTS["bench.toggle"],
  "browser.newTab": APP_SHORTCUTS["browser.newTab"],
  "sidebar.toggle": APP_SHORTCUTS["sidebar.toggle"],
} as const satisfies Record<string, RegisterableHotkey>

/** Application shortcut handled by one command hook rather than the indexed chat hook. */
export type ShortcutCommand = keyof typeof SHORTCUTS

/** Mod+1 … Mod+9 open chats in sidebar order. */
export const CHAT_JUMP_SHORTCUTS = [
  { command: "chat.jump.1", hotkey: APP_SHORTCUTS["chat.jump.1"] },
  { command: "chat.jump.2", hotkey: APP_SHORTCUTS["chat.jump.2"] },
  { command: "chat.jump.3", hotkey: APP_SHORTCUTS["chat.jump.3"] },
  { command: "chat.jump.4", hotkey: APP_SHORTCUTS["chat.jump.4"] },
  { command: "chat.jump.5", hotkey: APP_SHORTCUTS["chat.jump.5"] },
  { command: "chat.jump.6", hotkey: APP_SHORTCUTS["chat.jump.6"] },
  { command: "chat.jump.7", hotkey: APP_SHORTCUTS["chat.jump.7"] },
  { command: "chat.jump.8", hotkey: APP_SHORTCUTS["chat.jump.8"] },
  { command: "chat.jump.9", hotkey: APP_SHORTCUTS["chat.jump.9"] },
] as const satisfies readonly {
  command: AppShortcutID
  hotkey: RegisterableHotkey
}[]

/**
 * Surfaces that keep their own editing chords: the Bench markdown page, the dialogs MDXEditor
 * portals to `document.body`, and the whiteboard.
 */
export const BENCH_EDITOR_SELECTOR =
  '[data-component="markdown-bench-paper"], .mdxeditor-popup-container, [data-component="whiteboard-canvas"]'

/** Dialogs and popovers own the keyboard while focus is inside them. */
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]'

/**
 * False when a focused surface already handled the key, or focus is inside a dialog, a popover,
 * or `ignoreWithin`.
 */
export function shouldRunShortcut(
  event: Pick<Event, "defaultPrevented" | "target">,
  ignoreWithin?: string,
) {
  if (event.defaultPrevented) return false
  if (!(event.target instanceof Element)) return true
  if (event.target.closest(DIALOG_SELECTOR)) return false
  return !ignoreWithin || event.target.closest(ignoreWithin) === null
}
