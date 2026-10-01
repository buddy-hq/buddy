/** A second Cmd+Q inside this window quits; the first one only shows a hint. */
export const QUIT_DOUBLE_PRESS_MS = 500

/** Holding Cmd+Q, proven by auto-repeat key-downs, for this long commits to quitting. */
export const QUIT_HOLD_DURATION_MS = 1200

/**
 * "Still held" is proven by auto-repeat key-downs, not by the absence of a release: macOS
 * suppresses a letter keyUp while Cmd is down, so a tap release can go completely unseen and a
 * release-based timer would quit anyway. Once the hold is committed, quitting waits for the Q
 * keyUp or for this quiet period after repeats stop, so trailing repeats cannot reach the next
 * app. Keyboards with auto-repeat disabled must use a double press or the application menu.
 */
export const QUIT_HOLD_RELEASE_GRACE_MS = 600

/** A slow repeat rate can exceed the fixed grace; waiting two cadences stays behind the next repeat. */
const QUIT_HOLD_REPEAT_CADENCE_MULTIPLIER = 2

export type TQuitShortcutInput = {
  readonly type: string
  readonly key: string
  readonly meta: boolean
  readonly control: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly isAutoRepeat: boolean
}

type TQuitShortcutOptions = {
  readonly platform: NodeJS.Platform
  /** Shows or hides the "hold or press again" hint in the window that received the press. */
  readonly notify: (visible: boolean) => void
  /** Hides the window once a hold is committed so its remaining repeats are invisible. */
  readonly concealWindow: () => void
  readonly quit: () => void
  readonly now?: () => number
  /** Schedules a callback and returns a function that cancels it. */
  readonly schedule?: (callback: () => void, ms: number) => () => void
}

type TConcealableWindow = {
  isDestroyed: () => boolean
  isFullScreen: () => boolean
  setFullScreen: (fullScreen: boolean) => void
  setOpacity: (opacity: number) => void
}

type TWillPreventUnloadEventSource = {
  once(event: "will-prevent-unload", listener: () => void): void
  removeListener(event: "will-prevent-unload", listener: () => void): void
}

/**
 * Makes a window that is about to quit disappear while it keeps keyboard focus, so the rest of
 * the physical Cmd+Q hold cannot reach whichever app would be focused next.
 */
export function concealPendingQuitWindow(
  window: TConcealableWindow,
  unloadEventSources: readonly TWillPreventUnloadEventSource[] = [],
): void {
  if (window.isDestroyed()) return

  const revealAfterPreventedUnload = () => {
    for (const source of unloadEventSources) {
      source.removeListener("will-prevent-unload", revealAfterPreventedUnload)
    }
    if (!window.isDestroyed()) window.setOpacity(1)
  }

  for (const source of unloadEventSources) {
    source.once("will-prevent-unload", revealAfterPreventedUnload)
  }

  if (window.isFullScreen()) window.setFullScreen(false)
  window.setOpacity(0)
}

/**
 * Handles Cmd+Q from `before-input-event`, which runs before the native menu accelerator, so a
 * single press cannot quit. Pressing twice quickly or holding the chord quits; choosing Quit from
 * the application menu still quits immediately. Only macOS binds Cmd+Q to quit, so other
 * platforms keep the key.
 */
export function createQuitShortcutHandler(
  options: TQuitShortcutOptions,
): (event: { preventDefault: () => void }, input: TQuitShortcutInput) => void {
  const now = options.now ?? Date.now
  const schedule =
    options.schedule ??
    ((callback, ms) => {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    })

  let cancelWatchdog: (() => void) | undefined
  let holding = false
  let notified = false
  // Set while a press can still turn into a committed hold.
  let armed = false
  // Set once the hold is committed; the quit lands on release or after repeats go quiet.
  let quitOnRelease = false
  let heldSince = 0
  let lastPressAt = 0
  let lastRepeatAt = 0
  let repeatCadenceMs = 0

  const clearWatchdog = () => {
    cancelWatchdog?.()
    cancelWatchdog = undefined
  }

  const startWatchdog = (callback: () => void, ms: number) => {
    clearWatchdog()
    cancelWatchdog = schedule(() => {
      cancelWatchdog = undefined
      callback()
    }, ms)
  }

  const release = () => {
    if (!holding && !notified) return
    holding = false
    armed = false
    quitOnRelease = false
    lastRepeatAt = 0
    repeatCadenceMs = 0
    clearWatchdog()
    if (notified) {
      notified = false
      options.notify(false)
    }
  }

  // Dismisses the hint first so a cancelled quit cannot leave it stale.
  const quitNow = () => {
    release()
    lastPressAt = 0
    options.quit()
  }

  const quitAfterQuietPeriod = () => {
    const quietPeriodMs = Math.max(
      QUIT_HOLD_RELEASE_GRACE_MS,
      repeatCadenceMs * QUIT_HOLD_REPEAT_CADENCE_MULTIPLIER,
    )
    startWatchdog(quitNow, quietPeriodMs)
  }

  return (event, input) => {
    if (options.platform !== "darwin") return
    const key = input.key.toLowerCase()

    if (input.type === "keyUp") {
      if (key === "q") {
        const shouldQuit = quitOnRelease
        release()
        if (shouldQuit) options.quit()
      } else if (key === "meta") {
        if (quitOnRelease) quitAfterQuietPeriod()
        else release()
      }
      return
    }
    if (input.type !== "keyDown") return

    if (input.isAutoRepeat && input.meta && key === "q") {
      const at = now()
      repeatCadenceMs = at - (lastRepeatAt === 0 ? heldSince : lastRepeatAt)
      lastRepeatAt = at
    }

    if (quitOnRelease) {
      event.preventDefault()
      // A Q key-down proves the key is still down whether or not Cmd is, so it only pushes the
      // quiet period back.
      if (key === "q") quitAfterQuietPeriod()
      return
    }

    if (!input.meta || input.control || input.alt || input.shift || key !== "q") {
      // Re-pressing Cmd is the first half of a second full Cmd+Q, so it keeps the double-press
      // window open.
      if (key === "meta" && !input.control && !input.alt && !input.shift) return

      // Any other key cancels the hold and the first tap, even after release. Repeats of a key
      // that was already down do not count as a new interruption.
      if (!input.isAutoRepeat) {
        lastPressAt = 0
        release()
      }
      return
    }

    event.preventDefault()

    if (input.isAutoRepeat) {
      if (armed && now() - heldSince >= QUIT_HOLD_DURATION_MS) {
        armed = false
        quitOnRelease = true
        options.concealWindow()
        quitAfterQuietPeriod()
      }
      return
    }

    const pressedAt = now()
    const previousPressAt = lastPressAt
    lastPressAt = pressedAt
    // A fresh key-down supersedes the current hold or a hint kept alive after a missed release.
    if (holding || notified) release()

    if (previousPressAt !== 0 && pressedAt - previousPressAt <= QUIT_DOUBLE_PRESS_MS) {
      quitNow()
      return
    }

    holding = true
    armed = true
    heldSince = pressedAt
    notified = true
    options.notify(true)
    // No auto-repeat by then means the key was released (possibly with a suppressed keyUp) or
    // repeat is disabled; either way, don't quit.
    startWatchdog(release, QUIT_HOLD_DURATION_MS + QUIT_HOLD_RELEASE_GRACE_MS)
  }
}
