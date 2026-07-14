import { describe, expect, test } from "bun:test"
import { createDesktopUpdateNotificationTracker } from "@/lib/desktop-update-notification-tracker"

const FIRST_UPDATE_VERSION = "0.0.50"
const REPLACEMENT_UPDATE_VERSION = "0.0.51"

describe("desktop update notification tracker", () => {
  test("replaces a visible notification when the ready version changes", () => {
    const tracker = createDesktopUpdateNotificationTracker()
    const firstNotification = tracker.begin(FIRST_UPDATE_VERSION)

    expect(firstNotification).toEqual({ version: FIRST_UPDATE_VERSION })
    expect(tracker.begin(FIRST_UPDATE_VERSION)).toBeUndefined()

    const replacementNotification = tracker.begin(REPLACEMENT_UPDATE_VERSION)
    expect(replacementNotification).toEqual({ version: REPLACEMENT_UPDATE_VERSION })
  })

  test("does not let an older notification callback clear its replacement", () => {
    const tracker = createDesktopUpdateNotificationTracker()
    const firstNotification = tracker.begin(FIRST_UPDATE_VERSION)
    const replacementNotification = tracker.begin(REPLACEMENT_UPDATE_VERSION)
    if (!firstNotification || !replacementNotification) {
      throw new Error("Expected both update notifications to be created")
    }

    tracker.clear(firstNotification)
    expect(tracker.begin(REPLACEMENT_UPDATE_VERSION)).toBeUndefined()

    tracker.clear(replacementNotification)
    expect(tracker.begin(REPLACEMENT_UPDATE_VERSION)).toEqual({
      version: REPLACEMENT_UPDATE_VERSION,
    })
  })

  test("allows the same version to be shown after readiness is invalidated", () => {
    const tracker = createDesktopUpdateNotificationTracker()
    expect(tracker.begin(FIRST_UPDATE_VERSION)).toEqual({ version: FIRST_UPDATE_VERSION })

    tracker.reset()

    expect(tracker.begin(FIRST_UPDATE_VERSION)).toEqual({ version: FIRST_UPDATE_VERSION })
  })
})
