export type DesktopUpdateNotification = {
  version?: string
}

export type DesktopUpdateNotificationTracker = {
  begin: (version: string | undefined) => DesktopUpdateNotification | undefined
  clear: (notification: DesktopUpdateNotification) => void
  reset: () => void
}

export function createDesktopUpdateNotificationTracker(): DesktopUpdateNotificationTracker {
  let activeNotification: DesktopUpdateNotification | null = null

  return {
    begin(version) {
      if (activeNotification !== null && activeNotification.version === version) {
        return undefined
      }

      const notification = version === undefined ? {} : { version }
      activeNotification = notification
      return notification
    },
    clear(notification) {
      if (activeNotification === notification) {
        activeNotification = null
      }
    },
    reset() {
      activeNotification = null
    },
  }
}
