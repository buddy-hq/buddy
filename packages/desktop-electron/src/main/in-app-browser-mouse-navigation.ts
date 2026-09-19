import type { InAppBrowserMouseNavigation } from "@buddy/browser-contract"
import { IN_APP_BROWSER_MOUSE_NAVIGATION_CHANNEL } from "../shared/in-app-browser-mouse-navigation-channel"
import type { WebContents } from "electron"

type MouseNavigationEvent = { readonly senderFrame: object | null }

type MouseNavigationGuest = {
  readonly ipc: {
    on(
      channel: string,
      listener: (
        event: MouseNavigationEvent,
        payload: InAppBrowserMouseNavigation | null | undefined,
      ) => void,
    ): void
    removeListener(
      channel: string,
      listener: (
        event: MouseNavigationEvent,
        payload: InAppBrowserMouseNavigation | null | undefined,
      ) => void,
    ): void
  }
  readonly navigationHistory: Pick<
    WebContents["navigationHistory"],
    "canGoBack" | "canGoForward" | "goBack" | "goForward"
  >
}

/** Routes trusted guest thumb-button messages through Electron navigation history. */
export function installInAppBrowserMouseNavigation(guest: MouseNavigationGuest): () => void {
  const navigate = (
    _event: MouseNavigationEvent,
    payload: InAppBrowserMouseNavigation | null | undefined,
  ) => {
    const direction = payload?.direction
    if (direction === "back") {
      if (guest.navigationHistory.canGoBack()) guest.navigationHistory.goBack()
      return
    }
    if (direction === "forward" && guest.navigationHistory.canGoForward()) {
      guest.navigationHistory.goForward()
    }
  }
  guest.ipc.on(IN_APP_BROWSER_MOUSE_NAVIGATION_CHANNEL, navigate)
  return () => guest.ipc.removeListener(IN_APP_BROWSER_MOUSE_NAVIGATION_CHANNEL, navigate)
}
