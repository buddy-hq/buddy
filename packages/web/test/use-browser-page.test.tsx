import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useLayoutEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { IN_APP_BROWSER_BLANK_URL } from "@buddy/browser-contract"
import type { InAppBrowserWebview } from "../src/components/bench/surfaces/browser/in-app-browser-webview"
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
const ignoreAttached = () => undefined

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
        onAttached: ignoreAttached,
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

  test("keeps page controls on the observed URL until navigation commits", async () => {
    const initialUrl = "https://example.com/a"
    const destinationUrl = "https://other.example/b"
    const loadedUrls: string[] = []
    let guestUrl = initialUrl
    const webview = Object.assign(document.createElement("div"), {
      canGoBack: () => false,
      canGoForward: () => false,
      getTitle: () => "Example",
      getURL: () => guestUrl,
      getWebContentsId: () => 42,
      isLoading: () => false,
      loadURL: async (url: string) => {
        loadedUrls.push(url)
      },
      goBack: () => undefined,
      goForward: () => undefined,
      reload: () => undefined,
      reloadIgnoringCache: () => undefined,
      openDevTools: () => undefined,
      setZoomFactor: () => undefined,
      setAudioMuted: () => undefined,
    }) satisfies InAppBrowserWebview
    let page: ReturnType<typeof useBrowserPage> | undefined

    function Probe() {
      const currentPage = useBrowserPage({
        tabID: "browser-navigation-test",
        initialUrl,
        searchEngine: "duckduckgo",
        browser,
        onAttached: ignoreAttached,
      })
      const { setWebviewRef } = currentPage
      page = currentPage
      useLayoutEffect(() => {
        setWebviewRef(webview)
        return () => setWebviewRef(null)
      }, [setWebviewRef])
      return null
    }

    await act(async () => root.render(<Probe />))
    if (!page) throw new Error("Expected Browser page controls")
    expect(page.observedPageUrl).toBe(initialUrl)

    await act(async () => {
      expect(page?.navigateUrl(destinationUrl)).toBe(true)
    })
    expect(page.runtime.url).toBe(destinationUrl)
    expect(page.observedPageUrl).toBe(initialUrl)
    expect(loadedUrls).toEqual([destinationUrl])

    guestUrl = destinationUrl
    const navigationStarted = new Event("did-start-navigation")
    Object.defineProperties(navigationStarted, {
      isMainFrame: { value: true },
      url: { value: destinationUrl },
    })
    await act(async () => {
      webview.dispatchEvent(navigationStarted)
      webview.dispatchEvent(new Event("did-navigate"))
    })
    expect(page.observedPageUrl).toBe(destinationUrl)
  })
})
