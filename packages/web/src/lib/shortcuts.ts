import { APP_SHORTCUTS, type AppShortcutID } from "@buddy/browser-contract"
import { detectPlatform, formatForDisplay, type RegisterableHotkey } from "@tanstack/react-hotkeys"

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
  "composer.note.toggle": { key: "Enter", mod: true, shift: true },
  "search.open": APP_SHORTCUTS["search.open"],
  "file.quickOpen": APP_SHORTCUTS["file.quickOpen"],
  "bench.toggle": APP_SHORTCUTS["bench.toggle"],
  "browser.newTab": APP_SHORTCUTS["browser.newTab"],
  "bench.closeTab": APP_SHORTCUTS["bench.closeTab"],
  "sidebar.toggle": APP_SHORTCUTS["sidebar.toggle"],
} as const satisfies Record<string, RegisterableHotkey>

/** Application shortcut handled by one command hook rather than the indexed Bench tab hook. */
export type ShortcutCommand = keyof typeof SHORTCUTS

/**
 * Mod+1 … Mod+8 open Bench tabs in strip order, and Mod+9 opens the last one, as in browsers.
 */
export const BENCH_TAB_SHORTCUTS = [
  { command: "bench.tab.1", hotkey: APP_SHORTCUTS["bench.tab.1"] },
  { command: "bench.tab.2", hotkey: APP_SHORTCUTS["bench.tab.2"] },
  { command: "bench.tab.3", hotkey: APP_SHORTCUTS["bench.tab.3"] },
  { command: "bench.tab.4", hotkey: APP_SHORTCUTS["bench.tab.4"] },
  { command: "bench.tab.5", hotkey: APP_SHORTCUTS["bench.tab.5"] },
  { command: "bench.tab.6", hotkey: APP_SHORTCUTS["bench.tab.6"] },
  { command: "bench.tab.7", hotkey: APP_SHORTCUTS["bench.tab.7"] },
  { command: "bench.tab.8", hotkey: APP_SHORTCUTS["bench.tab.8"] },
  { command: "bench.tab.last", hotkey: APP_SHORTCUTS["bench.tab.last"] },
] as const satisfies readonly {
  command: AppShortcutID
  hotkey: RegisterableHotkey
}[]

/** How long Cmd/Ctrl is held alone before the tab strip shows each tab's key. */
export const BENCH_TAB_SHORTCUT_HINT_DELAY_MS = 500

/** Zero-based strip position a Bench tab key opens, or null when no tab sits there. */
export function benchTabShortcutPosition(
  command: (typeof BENCH_TAB_SHORTCUTS)[number]["command"],
  index: number,
  count: number,
): number | null {
  const position = command === "bench.tab.last" ? count - 1 : index
  return position >= 0 && position < count ? position : null
}

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

export type ShortcutDisplayPlatform = "mac" | "windows" | "linux"

export function shortcutDisplayPlatform(
  os: "macos" | "windows" | "linux" | undefined,
): ShortcutDisplayPlatform {
  if (os === "macos") return "mac"
  if (os === "windows") return "windows"
  if (os === "linux") return "linux"
  return detectPlatform()
}

/** The key that opens the tab at a zero-based strip position, or null when none does. */
export function benchTabShortcutAtPosition(
  position: number,
  count: number,
): RegisterableHotkey | null {
  return (
    BENCH_TAB_SHORTCUTS.find(
      (shortcut, index) => benchTabShortcutPosition(shortcut.command, index, count) === position,
    )?.hotkey ?? null
  )
}

const SHORTCUT_TOKEN_SEPARATOR = "\u0000"

/** A shortcut's display tokens, modifiers first: `["⌘", "1"]` or `["Ctrl", "1"]`. */
export function formatShortcutTokens(
  hotkey: RegisterableHotkey,
  platform: ShortcutDisplayPlatform,
): string[] {
  return formatForDisplay(hotkey, { platform, separatorToken: SHORTCUT_TOKEN_SEPARATOR }).split(
    SHORTCUT_TOKEN_SEPARATOR,
  )
}

/** What joins a shortcut's tokens in running text: nothing on macOS, `+` elsewhere. */
export function shortcutTokenSeparator(platform: ShortcutDisplayPlatform): string {
  return platform === "mac" ? "" : "+"
}

export function formatShortcutLabel(
  hotkey: RegisterableHotkey,
  platform: ShortcutDisplayPlatform,
): string {
  return formatShortcutTokens(hotkey, platform).join(shortcutTokenSeparator(platform))
}
