import { execFileSync } from "node:child_process"
import path from "node:path"

const BUDDY_CHECKOUT_NAME = "buddy"
const HIPPO_CHECKOUT_NAME = "hippo"
const BUDDY_TERMINAL_EMOJI = "🐼"
const HIPPO_TERMINAL_EMOJI = "🦛"
const OSC_SET_TITLE_PREFIX = "\x1b]0;"
const OSC_SET_TITLE_SUFFIX = "\x07"
const ASCII_CONTROL_MAX = 0x1f
const ASCII_DELETE = 0x7f

/** Input used to format a desktop-dev terminal tab title. */
export type TDesktopDevTerminalTitleInput = {
  /** Directory name of the git checkout or worktree. */
  readonly checkoutName: string
  /** Current git branch, or a fallback label when the branch is unavailable. */
  readonly branchName: string
}

/** Minimal stdout surface needed to emit a terminal title sequence. */
export type TTerminalTitleStream = {
  readonly isTTY?: boolean
  write(chunk: string): void
}

/**
 * Format the desktop-dev terminal tab title for a checkout.
 *
 * Named Buddy and Hippo checkouts get distinct emojis so parallel terminals
 * are easy to tell apart.
 */
export function formatDesktopDevTerminalTitle(input: TDesktopDevTerminalTitleInput): string {
  const checkoutName = input.checkoutName.trim()
  const branchName = input.branchName.trim() || checkoutName
  const emoji = terminalEmojiForCheckout(checkoutName)
  return emoji ? `${emoji} - ${branchName}` : branchName
}

/**
 * Read the current branch for a checkout, falling back to the directory name.
 */
export function resolveDesktopDevBranchName(repoRoot: string): string {
  try {
    const result = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      cwd: repoRoot,
    })
    const branch = result.trim()
    return branch || path.basename(repoRoot)
  } catch {
    return path.basename(repoRoot)
  }
}

/**
 * Write a terminal tab title when stdout is a TTY.
 *
 * Uses OSC 0 so macOS Terminal, iTerm, Ghostty, Windows Terminal, and Cursor
 * can pick the title up. Cursor still needs `${sequence}` in
 * `terminal.integrated.tabs.title` to show it instead of the process name.
 */
export function writeDesktopDevTerminalTitle(
  title: string,
  stdout: TTerminalTitleStream = process.stdout,
): void {
  if (!stdout.isTTY) return
  stdout.write(`${OSC_SET_TITLE_PREFIX}${sanitizeTerminalTitle(title)}${OSC_SET_TITLE_SUFFIX}`)
}

/**
 * Derive and apply the desktop-dev terminal tab title for this checkout.
 */
export function applyDesktopDevTerminalTitle(input: {
  repoRoot: string
  branchName?: string
  stdout?: TTerminalTitleStream
}): string {
  const branchName = input.branchName ?? resolveDesktopDevBranchName(input.repoRoot)
  const title = formatDesktopDevTerminalTitle({
    checkoutName: path.basename(input.repoRoot),
    branchName,
  })
  writeDesktopDevTerminalTitle(title, input.stdout ?? process.stdout)
  return title
}

function terminalEmojiForCheckout(checkoutName: string): string | undefined {
  const normalized = checkoutName.toLowerCase()
  if (normalized === BUDDY_CHECKOUT_NAME) return BUDDY_TERMINAL_EMOJI
  if (normalized === HIPPO_CHECKOUT_NAME) return HIPPO_TERMINAL_EMOJI
  return undefined
}

function sanitizeTerminalTitle(title: string): string {
  let sanitized = ""
  for (const character of title) {
    const code = character.codePointAt(0)
    if (code === undefined || code <= ASCII_CONTROL_MAX || code === ASCII_DELETE) continue
    sanitized += character
  }
  return sanitized
}
