import { useLayoutEffect, useState } from "react"

export const DESKTOP_TITLEBAR_SELECTOR = '[data-component="desktop-titlebar"]'

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
    if (!enabled || typeof window === "undefined") {
      setInset(0)
      return
    }

    const update = () => {
      setInset(readDesktopTitlebarBottomOffset())
    }

    update()

    const cleanups: Array<() => void> = []
    if (typeof ResizeObserver !== "undefined") {
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
