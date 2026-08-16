import { afterEach, describe, expect, mock, test } from "bun:test"

import { createBrowserPlatform } from "../src/context/platform"

type NotificationHandler = () => void

type NotificationInstance = {
  dispatch: (type: string) => void
}

function createNotificationStub(input: { permission: NotificationPermission }) {
  const instances: NotificationInstance[] = []

  class NotificationStub {
    static permission = input.permission

    static async requestPermission(): Promise<NotificationPermission> {
      return input.permission
    }

    private listeners = new Map<string, NotificationHandler[]>()

    constructor(_title: string, _options?: NotificationOptions) {
      instances.push({
        dispatch: (type) => {
          for (const handler of this.listeners.get(type) ?? []) {
            handler()
          }
        },
      })
    }

    addEventListener(type: string, handler: NotificationHandler) {
      const current = this.listeners.get(type) ?? []
      this.listeners.set(type, [...current, handler])
    }
  }

  return {
    NotificationStub,
    instances,
  }
}

const originalNotification = globalThis.Notification
const originalFocus = window.focus
const originalLocationAssign = window.location.assign

afterEach(() => {
  globalThis.Notification = originalNotification
  window.focus = originalFocus
  window.location.assign = originalLocationAssign
})

describe("browser platform notifications", () => {
  test("dispatches the in-app notification click event for same-origin links", async () => {
    const { NotificationStub, instances } = createNotificationStub({ permission: "granted" })
    const focusMock = mock(() => undefined)
    const assignMock = mock((_href: string | URL) => undefined)
    const clickSpy = mock((event: Event) => event)
    Reflect.set(globalThis, "Notification", NotificationStub)
    window.focus = focusMock
    window.location.assign = assignMock
    window.addEventListener("buddy:notification-click", clickSpy)

    try {
      await createBrowserPlatform().notify(
        "Ready",
        "Buddy finished",
        "/encoded/chat?session=ses_123",
      )

      expect(instances).toHaveLength(1)
      instances[0]?.dispatch("click")

      expect(focusMock).toHaveBeenCalled()
      expect(assignMock).not.toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalledTimes(1)

      const event = clickSpy.mock.calls[0]?.[0]
      expect(event).toBeInstanceOf(CustomEvent)
      if (!(event instanceof CustomEvent)) {
        throw new Error("Expected a CustomEvent")
      }
      expect(event.detail).toEqual({
        href: "/encoded/chat?session=ses_123",
      })
    } finally {
      window.removeEventListener("buddy:notification-click", clickSpy)
    }
  })

  test("falls back to navigation for cross-origin links", async () => {
    const { NotificationStub, instances } = createNotificationStub({ permission: "granted" })
    const focusMock = mock(() => undefined)
    const assignMock = mock((_href: string | URL) => undefined)
    Reflect.set(globalThis, "Notification", NotificationStub)
    window.focus = focusMock
    window.location.assign = assignMock

    await createBrowserPlatform().notify("External", "Open docs", "https://example.com/docs")

    expect(instances).toHaveLength(1)
    instances[0]?.dispatch("click")

    expect(focusMock).toHaveBeenCalled()
    expect(assignMock).toHaveBeenCalledWith("https://example.com/docs")
  })
})
