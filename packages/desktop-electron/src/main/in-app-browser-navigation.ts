import {
  IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL,
  isSafeInAppBrowserNavigationUrl,
} from "../shared/in-app-browser-navigation"

type InAppBrowserNavigationEvent = {
  preventDefault(): void
}

/** Guard an Electron navigation event with the in-app Browser URL policy. */
export function guardInAppBrowserNavigation(input: {
  event: InAppBrowserNavigationEvent
  url: string
  onBlocked: () => void
}): boolean {
  if (isSafeInAppBrowserNavigationUrl(input.url)) return true
  input.event.preventDefault()
  input.onBlocked()
  return false
}

type NavigationBlockedEvent = { readonly senderFrame: object | null }

type NavigationBlockedGuest = {
  readonly mainFrame: object
  readonly ipc: {
    on(channel: string, listener: (event: NavigationBlockedEvent) => void): void
    removeListener(channel: string, listener: (event: NavigationBlockedEvent) => void): void
  }
}

/** Forward trusted main-frame blocks from the guest preload to the Browser host. */
export function installInAppBrowserNavigationBlockedNotice(
  guest: NavigationBlockedGuest,
  onBlocked: () => void,
): () => void {
  const blocked = (event: NavigationBlockedEvent) => {
    if (event.senderFrame === guest.mainFrame) onBlocked()
  }
  guest.ipc.on(IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL, blocked)
  return () => guest.ipc.removeListener(IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL, blocked)
}
