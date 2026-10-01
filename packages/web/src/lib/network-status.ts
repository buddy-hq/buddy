import { useSyncExternalStore } from "react"

/**
 * Whether this machine has a network connection. Chromium only reports "offline" when no
 * network interface is up, so "online" does not guarantee a model provider is reachable.
 */
export type NetworkStatus = "online" | "offline"

/** Read whether the browser reports an active network connection. */
export function readNetworkStatus(): NetworkStatus {
  return navigator.onLine ? "online" : "offline"
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/** Network status, re-read on the window's `online` and `offline` events. */
export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, readNetworkStatus, (): NetworkStatus => "online")
}
