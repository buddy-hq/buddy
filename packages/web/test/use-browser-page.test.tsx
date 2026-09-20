import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { IN_APP_BROWSER_BLANK_URL } from "@buddy/browser-contract"
import { useBrowserPage } from "../src/components/bench/surfaces/browser/use-browser-page"
import type { InAppBrowserPlatform } from "../src/context/platform"

const browser: InAppBrowserPlatform = {
  webPreferences: "",
  onMessage: () => () => undefined,
  onFavicon: () => () => undefined,
  onAudio: () => () => undefined,
  onShortcut: () => () => undefined,
  setAppearance: async () => ({ _tag: "done" }),
  clearProfileData: async () => ({ _tag: "done" }),
  checkSafariFullDiskAccess: async () => false,
  listImportSources: async () => [],
  importCookies: async () => ({
    _tag: "imported",
    imported: 0,
    skipped: 0,
    skippedDomains: [],
  }),
  openFullDiskAccessSettings: async () => undefined,
}

describe("Browser page input", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("commits searches and rejects unsupported schemes at the page boundary", async () => {
    let page: ReturnType<typeof useBrowserPage> | undefined

    function Probe() {
      page = useBrowserPage({
        tabID: "browser-search-test",
        initialUrl: IN_APP_BROWSER_BLANK_URL,
        searchEngine: "duckduckgo",
        browser,
        onAttached: () => undefined,
      })
      return null
    }

    await act(async () => root.render(<Probe />))
    if (!page) throw new Error("Expected Browser page controls")

    await act(async () => {
      expect(page?.submitInput("weather")).toBe(true)
    })
    expect(page.runtime.url).toBe("https://duckduckgo.com/?q=weather")

    await act(async () => {
      expect(page?.submitInput("javascript:alert(1)")).toBe(false)
    })
    expect(page.runtime.url).toBe("https://duckduckgo.com/?q=weather")
    expect(page.notice).toBe("This address type is not supported.")
  })
})
