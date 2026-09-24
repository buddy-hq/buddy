import { describe, expect, setSystemTime, test } from "bun:test"
import {
  registerNoteMessageNavigationHandler,
  requestNoteMessageNavigation,
  retryPendingNoteMessageNavigation,
  type NoteMessageTarget,
} from "../src/features/notes/chat-message-navigation"

const TARGET: NoteMessageTarget = {
  directory: "/notebook",
  sessionID: "session-1",
  messageID: "message-1",
}

describe("note message navigation", () => {
  test("keeps a source request until its transcript mounts", async () => {
    const seen: NoteMessageTarget[] = []
    await requestNoteMessageNavigation(TARGET)

    const unregister = registerNoteMessageNavigationHandler((target) => {
      seen.push(target)
      return "handled"
    })
    await Promise.resolve()
    await Promise.resolve()
    unregister()

    expect(seen).toEqual([TARGET])
  })

  test("keeps paging requests pending until a handler confirms the row", async () => {
    let available = false
    const seen: NoteMessageTarget[] = []
    const unregister = registerNoteMessageNavigationHandler((target) => {
      seen.push(target)
      return available ? "handled" : "pending"
    })

    await requestNoteMessageNavigation(TARGET)
    available = true
    await retryPendingNoteMessageNavigation()
    unregister()

    const replayed: NoteMessageTarget[] = []
    const unregisterReplay = registerNoteMessageNavigationHandler((target) => {
      replayed.push(target)
      return "handled"
    })
    await Promise.resolve()
    unregisterReplay()

    expect(seen).toEqual([TARGET, TARGET])
    expect(replayed).toEqual([])
  })

  test("drops a request that no transcript claims before it expires", async () => {
    try {
      setSystemTime(new Date("2026-09-24T10:00:00.000Z"))
      await requestNoteMessageNavigation(TARGET)
      setSystemTime(new Date("2026-09-24T10:01:00.000Z"))

      const seen: NoteMessageTarget[] = []
      const unregister = registerNoteMessageNavigationHandler((target) => {
        seen.push(target)
        return "handled"
      })
      await retryPendingNoteMessageNavigation()
      unregister()

      expect(seen).toEqual([])
    } finally {
      setSystemTime()
    }
  })

  test("offers a request to one handler call at a time while rows keep changing", async () => {
    let active = 0
    let maxActive = 0
    const releases: Array<() => void> = []
    const unregister = registerNoteMessageNavigationHandler(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      return "handled" as const
    })

    const request = requestNoteMessageNavigation(TARGET)
    const retries = [retryPendingNoteMessageNavigation(), retryPendingNoteMessageNavigation()]
    for (const release of releases.splice(0)) release()
    await Promise.all([request, ...retries])
    unregister()

    expect(maxActive).toBe(1)
  })
})
