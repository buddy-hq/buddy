import { afterEach, describe, expect, test } from "bun:test"

const STYLESHEET_URL = new URL(
  "../src/components/bench/surfaces/browser-bench-surface.css",
  import.meta.url,
)
const PRIVACY_STYLE_ID = "browser-bench-surface-privacy-test"

async function applyPrivacyStylesheet(): Promise<void> {
  document.querySelector(`#${PRIVACY_STYLE_ID}`)?.remove()
  const style = document.createElement("style")
  style.id = PRIVACY_STYLE_ID
  style.textContent = await Bun.file(STYLESHEET_URL).text()
  document.head.append(style)
}

function createWebview(tabID: string, keepPaintable: boolean): HTMLElement {
  const host = document.createElement("div")
  if (keepPaintable) host.setAttribute("data-keep-webview-paintable", "true")
  const webview = document.createElement("webview")
  webview.setAttribute("data-browser-tab-id", tabID)
  // Match the production webview's `absolute inset-0` sizing so privacy CSS must
  // beat left/top/right/bottom: 0 rather than only applying to an unsized guest.
  webview.style.position = "absolute"
  webview.style.top = "0px"
  webview.style.right = "0px"
  webview.style.bottom = "0px"
  webview.style.left = "0px"
  host.append(webview)
  document.body.append(host)
  return webview
}

function computedPx(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || !value.endsWith("px")) {
    throw new Error(`expected a pixel computed style, received ${value}`)
  }
  return parsed
}

afterEach(() => {
  document.documentElement.removeAttribute("data-bench-capture-privacy")
  document.querySelector(`#${PRIVACY_STYLE_ID}`)?.remove()
  for (const webview of document.querySelectorAll("webview[data-browser-tab-id]")) {
    webview.parentElement?.remove()
  }
})

describe("browser bench surface screenshot privacy", () => {
  test("hides unmarked webviews and parks paintable ones offscreen", async () => {
    await applyPrivacyStylesheet()
    document.documentElement.setAttribute("data-bench-capture-privacy", "true")

    const hidden = createWebview("hidden", false)
    const paintable = createWebview("paintable", true)
    const paintableStyle = getComputedStyle(paintable)
    const left = computedPx(paintableStyle.left)
    const top = computedPx(paintableStyle.top)
    const width = computedPx(paintableStyle.width)
    const height = computedPx(paintableStyle.height)

    expect(getComputedStyle(hidden).visibility).toBe("hidden")
    expect(paintableStyle.visibility).toBe("visible")
    expect(paintableStyle.position).toBe("fixed")
    expect(paintableStyle.left).toBe("-100000px")
    expect(paintableStyle.top).toBe("-100000px")
    expect(paintableStyle.right).toBe("auto")
    expect(paintableStyle.bottom).toBe("auto")
    expect(width).toBe(window.innerWidth)
    expect(height).toBe(window.innerHeight)
    expect(left + width).toBeLessThan(0)
    expect(top + height).toBeLessThan(0)
    expect(paintableStyle.pointerEvents).toBe("none")
  })

  test("does not hide webviews when screenshot privacy is off", async () => {
    await applyPrivacyStylesheet()

    const webview = createWebview("visible", false)

    expect(getComputedStyle(webview).visibility).not.toBe("hidden")
  })
})
