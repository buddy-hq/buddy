import { useSyncExternalStore } from "react"

/** Server/first-paint fallback: a common laptop width, so layout does not start clamped to nothing. */
const VIEWPORT_WIDTH_FALLBACK_PX = 1440

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

function readViewportWidth() {
  return window.innerWidth > 0 ? window.innerWidth : VIEWPORT_WIDTH_FALLBACK_PX
}

/** Window width, re-read on resize. For layouts whose limits scale with the window. */
export function useViewportWidth() {
  return useSyncExternalStore(subscribe, readViewportWidth, () => VIEWPORT_WIDTH_FALLBACK_PX)
}
