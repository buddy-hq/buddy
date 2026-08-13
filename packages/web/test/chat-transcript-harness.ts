import type { RefObject } from "react"

const TEST_VIEWPORT_HEIGHT_PX = 800
const TEST_VIEWPORT_WIDTH_PX = 1_000
const TEST_VIEWPORT_SCROLL_HEIGHT_PX = 1_600

export type ChatTranscriptTestViewport = {
  ref: RefObject<HTMLElement | null>
  cleanup: () => void
}

type ChatTranscriptTestViewportOptions = {
  height?: number
  width?: number
  scrollHeight?: number
  clampScrollTop?: boolean
}

export function createChatTranscriptTestViewport(
  options: ChatTranscriptTestViewportOptions = {},
): ChatTranscriptTestViewport {
  const element = document.createElement("div")
  const viewportHeight = options.height ?? TEST_VIEWPORT_HEIGHT_PX
  const viewportWidth = options.width ?? TEST_VIEWPORT_WIDTH_PX
  const scrollHeight = options.scrollHeight ?? TEST_VIEWPORT_SCROLL_HEIGHT_PX
  let scrollTop = 0

  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => viewportHeight,
    },
    clientWidth: {
      configurable: true,
      get: () => viewportWidth,
    },
    offsetHeight: {
      configurable: true,
      get: () => viewportHeight,
    },
    offsetWidth: {
      configurable: true,
      get: () => viewportWidth,
    },
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        const next = options.clampScrollTop
          ? Math.min(Math.max(0, value), Math.max(0, scrollHeight - viewportHeight))
          : value
        if (next === scrollTop) return
        scrollTop = next
        // A real viewport notifies listeners when its offset changes, and the
        // virtualizer refreshes its logical offset only from that event. Without
        // it the virtualizer's offset silently diverges from the DOM here in a
        // way it never does in a browser. Asynchronously, as browsers do — a
        // synchronous dispatch would run React's flushSync inside whatever
        // lifecycle wrote the offset.
        queueMicrotask(() => element.dispatchEvent(new Event("scroll")))
      },
    },
  })
  element.getBoundingClientRect = () => new DOMRect(0, 0, viewportWidth, viewportHeight)
  document.body.appendChild(element)

  return {
    ref: { current: element },
    cleanup() {
      element.remove()
    },
  }
}
