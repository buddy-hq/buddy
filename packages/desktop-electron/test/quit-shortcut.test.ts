import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import {
  concealPendingQuitWindow,
  createQuitShortcutHandler,
  QUIT_DOUBLE_PRESS_MS,
  QUIT_HOLD_DURATION_MS,
  QUIT_HOLD_RELEASE_GRACE_MS,
  type TQuitShortcutInput,
} from "../src/main/quit-shortcut"

const CMD_Q: TQuitShortcutInput = {
  type: "keyDown",
  key: "q",
  meta: true,
  control: false,
  alt: false,
  shift: false,
  isAutoRepeat: false,
}

function harness(platform: NodeJS.Platform = "darwin") {
  let clock = 1_000
  let nextId = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  const hints: boolean[] = []
  let quits = 0
  let conceals = 0
  let prevented = 0

  const handle = createQuitShortcutHandler({
    platform,
    notify: (visible) => hints.push(visible),
    concealWindow: () => {
      conceals += 1
    },
    quit: () => {
      quits += 1
    },
    now: () => clock,
    schedule: (callback, ms) => {
      const id = nextId++
      timers.set(id, { at: clock + ms, callback })
      return () => timers.delete(id)
    },
  })

  // Advances the clock, firing due timers in order.
  const advance = (ms: number) => {
    const target = clock + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .toSorted((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      clock = due[1].at
      due[1].callback()
    }
    clock = target
  }

  const send = (input: Partial<TQuitShortcutInput> = {}) => {
    handle({ preventDefault: () => (prevented += 1) }, { ...CMD_Q, ...input })
  }

  // Simulates the OS auto-repeating the held shortcut every `intervalMs`.
  const holdFor = (
    durationMs: number,
    repeat: Partial<TQuitShortcutInput> = {},
    intervalMs = 100,
  ) => {
    for (let elapsed = 0; elapsed < durationMs; elapsed += intervalMs) {
      advance(intervalMs)
      send({ isAutoRepeat: true, ...repeat })
    }
  }

  return {
    send,
    advance,
    holdFor,
    hints,
    quits: () => quits,
    conceals: () => conceals,
    prevented: () => prevented,
  }
}

function fakeWindow(state: { destroyed?: boolean; fullScreen?: boolean }) {
  const calls: string[] = []
  return {
    calls,
    window: {
      isDestroyed: () => state.destroyed ?? false,
      isFullScreen: () => state.fullScreen ?? false,
      setFullScreen: (value: boolean) => calls.push(`fullscreen:${value}`),
      setOpacity: (value: number) => calls.push(`opacity:${value}`),
    },
  }
}

const RELEASE_Q = { type: "keyUp" } as const
const RELEASE_CMD = { type: "keyUp", key: "Meta", meta: false } as const

describe("quit shortcut", () => {
  test("a tap shows the hint without quitting, even when the release is never seen", () => {
    const h = harness()

    h.send()
    expect(h.prevented()).toBe(1)
    expect(h.hints).toEqual([true])

    // macOS suppresses the Q keyUp while Cmd is held, so the watchdog dismisses the hint.
    h.advance(QUIT_HOLD_DURATION_MS + QUIT_HOLD_RELEASE_GRACE_MS)

    expect(h.quits()).toBe(0)
    expect(h.hints).toEqual([true, false])
  })

  test("a second press within the window quits and hides the hint", () => {
    const h = harness()

    h.send()
    h.send(RELEASE_Q)
    h.advance(QUIT_DOUBLE_PRESS_MS - 100)
    h.send()

    expect(h.conceals()).toBe(0)
    expect(h.quits()).toBe(1)
    expect(h.hints).toEqual([true, false])
  })

  test("a second press after the window starts over", () => {
    const h = harness()

    h.send()
    h.send(RELEASE_Q)
    h.advance(QUIT_DOUBLE_PRESS_MS + 100)
    h.send()

    expect(h.quits()).toBe(0)
    expect(h.hints).toEqual([true, false, true])
  })

  test("auto-repeat does not count as a second press", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_DOUBLE_PRESS_MS - 100)

    expect(h.quits()).toBe(0)
    expect(h.hints).toEqual([true])
  })

  test("a completed hold conceals the window, then quits after release", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_HOLD_DURATION_MS + 200)
    expect(h.conceals()).toBe(1)
    expect(h.quits()).toBe(0)

    h.send(RELEASE_CMD)
    expect(h.quits()).toBe(0)
    h.advance(QUIT_HOLD_RELEASE_GRACE_MS)

    expect(h.quits()).toBe(1)
    expect(h.hints).toEqual([true, false])
  })

  test("quits as soon as Q is released after a completed hold", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_HOLD_DURATION_MS + 200)
    h.send(RELEASE_Q)

    expect(h.quits()).toBe(1)
  })

  test("a completed hold stays committed when another key is pressed", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_HOLD_DURATION_MS)
    h.send({ key: "Shift", shift: true })

    expect(h.conceals()).toBe(1)
    expect(h.quits()).toBe(0)
    h.advance(QUIT_HOLD_RELEASE_GRACE_MS)
    expect(h.quits()).toBe(1)
  })

  test("quits when a completed hold goes quiet without release events", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_HOLD_DURATION_MS + QUIT_HOLD_RELEASE_GRACE_MS * 2)

    // Continued repeats keep the app alive; once they stop, the quiet period is the release.
    expect(h.quits()).toBe(0)
    h.advance(QUIT_HOLD_RELEASE_GRACE_MS)

    expect(h.quits()).toBe(1)
    expect(h.hints).toEqual([true, false])
  })

  test("waits for slow repeats to stop before quitting", () => {
    const h = harness()

    h.send()
    h.advance(300)
    h.send({ isAutoRepeat: true })
    h.advance(900)
    h.send({ isAutoRepeat: true })
    h.advance(QUIT_HOLD_RELEASE_GRACE_MS)
    expect(h.quits()).toBe(0)

    h.advance(300)
    h.send({ isAutoRepeat: true })
    h.advance(1_799)
    expect(h.quits()).toBe(0)
    h.advance(1)
    expect(h.quits()).toBe(1)
  })

  test("waits for Q release when Cmd is released first", () => {
    const h = harness()

    h.send()
    h.holdFor(QUIT_HOLD_DURATION_MS + 200)
    h.send(RELEASE_CMD)
    // Repeats without Cmd prove Q is still down, so they hold the quit back.
    h.holdFor(QUIT_HOLD_RELEASE_GRACE_MS * 2, { meta: false })
    expect(h.quits()).toBe(0)

    h.send({ ...RELEASE_Q, meta: false })
    expect(h.quits()).toBe(1)
  })

  test("waits for slow Q repeats to stop after Cmd is released first", () => {
    const h = harness()

    h.send()
    h.advance(300)
    h.send({ isAutoRepeat: true })
    h.advance(900)
    h.send({ isAutoRepeat: true })
    expect(h.conceals()).toBe(1)

    h.send(RELEASE_CMD)
    h.advance(899)
    h.send({ isAutoRepeat: true, meta: false })
    h.advance(QUIT_HOLD_RELEASE_GRACE_MS * 3 - 1)
    expect(h.quits()).toBe(0)

    h.advance(1)
    expect(h.quits()).toBe(1)
  })

  test("does not quit when the hold stops before the duration", () => {
    const h = harness()

    h.send()
    h.holdFor(500)
    h.send(RELEASE_Q)
    expect(h.hints).toEqual([true, false])

    h.advance((QUIT_HOLD_DURATION_MS + QUIT_HOLD_RELEASE_GRACE_MS) * 2)
    expect(h.conceals()).toBe(0)
    expect(h.quits()).toBe(0)
  })

  test("cancels the hold when Cmd is released first", () => {
    const h = harness()

    h.send()
    h.send(RELEASE_CMD)
    expect(h.hints).toEqual([true, false])

    h.advance((QUIT_HOLD_DURATION_MS + QUIT_HOLD_RELEASE_GRACE_MS) * 2)
    expect(h.quits()).toBe(0)
  })

  test("another key cancels the hold and the first tap", () => {
    const h = harness()

    h.send()
    h.holdFor(500)
    h.send({ shift: true })
    expect(h.hints).toEqual([true, false])

    h.holdFor(QUIT_HOLD_DURATION_MS)
    expect(h.quits()).toBe(0)
  })

  test("a released tap interrupted by another shortcut does not count toward a double press", () => {
    const h = harness()

    h.send()
    h.send(RELEASE_Q)
    h.send({ key: "c" })
    h.advance(100)
    h.send()

    expect(h.quits()).toBe(0)
    expect(h.hints).toEqual([true, false, true])
  })

  test("re-pressing Cmd keeps the first tap alive", () => {
    const h = harness()

    h.send()
    h.send(RELEASE_Q)
    h.send(RELEASE_CMD)
    h.advance(100)
    h.send({ key: "Meta" })
    h.send()

    expect(h.quits()).toBe(1)
  })

  test("ignores other shortcuts", () => {
    const h = harness()

    h.send({ key: "w" })
    h.send({ shift: true })
    h.send({ meta: false })

    expect(h.prevented()).toBe(0)
    expect(h.hints).toEqual([])
  })

  test("leaves the key alone outside macOS", () => {
    const h = harness("win32")

    h.send({ meta: false, control: true })
    h.send({ meta: false, control: true })

    expect(h.prevented()).toBe(0)
    expect(h.quits()).toBe(0)
  })
})

describe("concealPendingQuitWindow", () => {
  test("leaves full screen, then makes the window transparent", () => {
    const { window, calls } = fakeWindow({ fullScreen: true })
    concealPendingQuitWindow(window)
    expect(calls).toEqual(["fullscreen:false", "opacity:0"])
  })

  test("does nothing for a destroyed window", () => {
    const { window, calls } = fakeWindow({ destroyed: true })
    concealPendingQuitWindow(window)
    expect(calls).toEqual([])
  })

  test("reveals the target when a different window prevents unload and removes every listener", () => {
    const { window, calls } = fakeWindow({})
    const [targetContents, blockerContents, siblingContents] = [
      new EventEmitter(),
      new EventEmitter(),
      new EventEmitter(),
    ]

    concealPendingQuitWindow(window, [targetContents, blockerContents, siblingContents])
    expect(calls).toEqual(["opacity:0"])

    blockerContents.emit("will-prevent-unload")

    expect(calls).toEqual(["opacity:0", "opacity:1"])
    expect(targetContents.listenerCount("will-prevent-unload")).toBe(0)
    expect(blockerContents.listenerCount("will-prevent-unload")).toBe(0)
    expect(siblingContents.listenerCount("will-prevent-unload")).toBe(0)
  })

  test("does not retain listeners across cancelled quit attempts", () => {
    const { window, calls } = fakeWindow({})
    const sources = [new EventEmitter(), new EventEmitter()]

    concealPendingQuitWindow(window, sources)
    sources[1].emit("will-prevent-unload")
    expect(sources.map((source) => source.listenerCount("will-prevent-unload"))).toEqual([0, 0])

    concealPendingQuitWindow(window, sources)
    expect(sources.map((source) => source.listenerCount("will-prevent-unload"))).toEqual([1, 1])
    sources[1].emit("will-prevent-unload")

    expect(calls).toEqual(["opacity:0", "opacity:1", "opacity:0", "opacity:1"])
    expect(sources.map((source) => source.listenerCount("will-prevent-unload"))).toEqual([0, 0])
  })

  test("cleans listeners without revealing a destroyed target", () => {
    const state = { destroyed: false }
    const { window, calls } = fakeWindow(state)
    const sources = [new EventEmitter(), new EventEmitter()]

    concealPendingQuitWindow(window, sources)
    state.destroyed = true
    sources[1].emit("will-prevent-unload")

    expect(calls).toEqual(["opacity:0"])
    expect(sources.map((source) => source.listenerCount("will-prevent-unload"))).toEqual([0, 0])
  })
})
