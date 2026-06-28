import type { RefObject } from "react"

const TEST_VIEWPORT_HEIGHT_PX = 800
const TEST_VIEWPORT_WIDTH_PX = 1_000
const TEST_VIEWPORT_SCROLL_HEIGHT_PX = 1_600

export type ChatTranscriptTestViewport = {
  ref: RefObject<HTMLElement | null>
  cleanup: () => void
}

export function createChatTranscriptTestViewport(): ChatTranscriptTestViewport {
  const element = document.createElement("div")
  let scrollTop = 0

  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => TEST_VIEWPORT_HEIGHT_PX,
    },
    clientWidth: {
      configurable: true,
      get: () => TEST_VIEWPORT_WIDTH_PX,
    },
    offsetHeight: {
      configurable: true,
      get: () => TEST_VIEWPORT_HEIGHT_PX,
    },
    offsetWidth: {
      configurable: true,
      get: () => TEST_VIEWPORT_WIDTH_PX,
    },
    scrollHeight: {
      configurable: true,
      get: () => TEST_VIEWPORT_SCROLL_HEIGHT_PX,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    },
  })
  element.getBoundingClientRect = () =>
    new DOMRect(0, 0, TEST_VIEWPORT_WIDTH_PX, TEST_VIEWPORT_HEIGHT_PX)
  document.body.appendChild(element)

  return {
    ref: { current: element },
    cleanup() {
      element.remove()
    },
  }
}
