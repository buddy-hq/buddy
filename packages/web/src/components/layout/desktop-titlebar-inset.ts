import { useLayoutEffect, useState } from "react"
import { browserWindow } from "@/state/parse-external"

export const DESKTOP_TITLEBAR_SELECTOR = '[data-component="desktop-titlebar"]'

/**
 * One titlebar height for every placement (root, chat, settings).
 *
 * The native chrome is aligned to this same value and cannot follow a per-route height:
 * macOS `trafficLightPosition.y` and the Windows `titleBarOverlay.height` are both fixed at
 * window creation in `packages/desktop-electron/src/main/windows.ts`. Changing this constant
 * means updating those two, or native and web controls drift out of alignment.
 *
 * 40px sits 7px above and below the tallest content in the bar (a 24px `h-6` control inside a
 * 1px-bordered pill = 26px).
 */
export const DESKTOP_TITLEBAR_HEIGHT_PX = 40

export function readDesktopTitlebarBottomOffset() {
  const titlebars = document.querySelectorAll(DESKTOP_TITLEBAR_SELECTOR)
  let maxBottom = 0

  for (const titlebar of titlebars) {
    if (!(titlebar instanceof HTMLElement)) {
      continue
    }

    const { bottom } = titlebar.getBoundingClientRect()
    if (!Number.isFinite(bottom) || bottom <= 0) {
      continue
    }

    maxBottom = Math.max(maxBottom, bottom)
  }

  return Math.ceil(maxBottom)
}

export function useDesktopTitlebarInset(enabled = true) {
  const [inset, setInset] = useState(0)

  useLayoutEffect(() => {
    if (!enabled || !browserWindow()) {
      setInset(0)
      return
    }

    const update = () => {
      setInset(readDesktopTitlebarBottomOffset())
    }

    update()

    const cleanups: Array<() => void> = []
    if ("ResizeObserver" in globalThis) {
      const observer = new ResizeObserver(update)
      for (const titlebar of document.querySelectorAll(DESKTOP_TITLEBAR_SELECTOR)) {
        if (titlebar instanceof HTMLElement) {
          observer.observe(titlebar)
        }
      }
      cleanups.push(() => observer.disconnect())
    }

    window.addEventListener("resize", update)
    cleanups.push(() => window.removeEventListener("resize", update))

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [enabled])

  return inset
}
