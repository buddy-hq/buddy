import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { InAppBrowserCommandResult } from "@buddy/browser-contract"
import { DEFAULT_IN_APP_BROWSER_PROFILE_ID } from "@buddy/browser-contract/profiles"
import {
  applyInAppBrowserAppearance,
  useBrowserPageControls,
} from "../src/components/bench/surfaces/browser/use-browser-page-controls"
import type {
  InAppBrowserWebview,
  WithInAppBrowserWebview,
} from "../src/components/bench/surfaces/browser/in-app-browser-webview"
import type { InAppBrowserPlatform } from "../src/context/platform"
import { DEFAULT_IN_APP_BROWSER_SETTINGS } from "../src/lib/in-app-browser-settings"
import { parseInAppBrowserZoomHost } from "../src/lib/in-app-browser-zoom"
import { useInAppBrowserSettingsStore } from "../src/state/in-app-browser-settings-store"

const REQUEST = { webContentsID: 42, appearance: "dark" as const }

function delay(result: InAppBrowserCommandResult): Promise<InAppBrowserCommandResult> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(result))
  })
}

describe("in-app Browser appearance apply", () => {
  test("logs a structured failure once for a rejected command and a failed result", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)
    const cause = new Error("debugger attach failed")

    try {
      await applyInAppBrowserAppearance(
        async () => {
          throw cause
        },
        { ...REQUEST, webContentsID: 7 },
      )
      await applyInAppBrowserAppearance(
        async () => ({ _tag: "failed", reason: "tab-unavailable" }),
        {
          ...REQUEST,
          webContentsID: 8,
        },
      )

      expect(consoleError.mock.calls).toEqual([
        ["[in-app-browser] appearance.failed", { webContentsID: 7, appearance: "dark", cause }],
        [
          "[in-app-browser] appearance.failed",
          { webContentsID: 8, appearance: "dark", reason: "tab-unavailable" },
        ],
      ])
    } finally {
      consoleError.mockRestore()
    }
  })

  test("does not log a successful apply", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)

    try {
      await applyInAppBrowserAppearance(async () => ({ _tag: "done" }), REQUEST)
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  test("shares one in-flight request so attach and later apply do not double-log", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined)
    let calls = 0
    const setAppearance = () => {
      calls += 1
      return delay({ _tag: "failed", reason: "operation-failed" })
    }

    try {
      const first = applyInAppBrowserAppearance(setAppearance, REQUEST)
      const second = applyInAppBrowserAppearance(setAppearance, REQUEST)
      await Promise.all([first, second])

      expect(calls).toBe(1)
      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith("[in-app-browser] appearance.failed", {
        webContentsID: 42,
        appearance: "dark",
        reason: "operation-failed",
      })
    } finally {
      consoleError.mockRestore()
    }
  })
})

const browser: InAppBrowserPlatform = {
  webPreferences: "",
  onMessage: () => () => undefined,
  onFavicon: () => () => undefined,
  onAudio: () => () => undefined,
  onShortcut: () => () => undefined,
  onCitation: () => () => undefined,
  captureCitation: async () => ({ _tag: "failed" as const, reason: "no-selection" as const }),
  markCitation: async () => ({ _tag: "not-found" as const }),
  unmarkCitation: async () => ({ _tag: "done" as const }),
  revealCitation: async () => ({ _tag: "not-found" as const }),
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

function createWebview(onZoom: (factor: number) => void): InAppBrowserWebview {
  return Object.assign(document.createElement("div"), {
    canGoBack: () => false,
    canGoForward: () => false,
    getTitle: () => "Example",
    getURL: () => "https://example.com",
    getWebContentsId: () => 42,
    isLoading: () => false,
    loadURL: async () => undefined,
    goBack: () => undefined,
    goForward: () => undefined,
    reload: () => undefined,
    reloadIgnoringCache: () => undefined,
    openDevTools: () => undefined,
    setZoomFactor: onZoom,
    setAudioMuted: () => undefined,
  })
}

describe("in-app Browser page zoom", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    container = null
    useInAppBrowserSettingsStore.setState(DEFAULT_IN_APP_BROWSER_SETTINGS)
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("shares host zoom across ports and schemes and clears the override at the configured default", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    const exampleHost = parseInAppBrowserZoomHost("https://example.com")
    if (!exampleHost) throw new Error("Expected test host")
    useInAppBrowserSettingsStore.setState({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      defaultZoomFactor: 1.25,
      zoomFactorsByProfile: {
        [DEFAULT_IN_APP_BROWSER_PROFILE_ID]: { [exampleHost]: 1.5 },
      },
    })

    const appliedZoomFactors: number[] = []
    const webview = createWebview((factor) => appliedZoomFactors.push(factor))
    const withWebview: WithInAppBrowserWebview = (action) => action(webview)
    let controls: ReturnType<typeof useBrowserPageControls> | undefined

    function Probe(props: { observedPageUrl: string }) {
      controls = useBrowserPageControls({
        tabID: "browser-tab",
        profileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
        browser,
        webContentsID: 42,
        observedPageUrl: props.observedPageUrl,
        withWebview,
      })
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () =>
      root?.render(createElement(Probe, { observedPageUrl: "https://example.com/a" })),
    )
    expect(appliedZoomFactors.at(-1)).toBe(1.5)

    await act(async () => controls?.zoomOut())
    expect(appliedZoomFactors.at(-1)).toBe(1.25)
    expect(
      useInAppBrowserSettingsStore.getState().zoomFactorsByProfile[
        DEFAULT_IN_APP_BROWSER_PROFILE_ID
      ],
    ).toBeUndefined()

    await act(async () =>
      root?.render(createElement(Probe, { observedPageUrl: "https://other.example/page" })),
    )
    expect(appliedZoomFactors.at(-1)).toBe(1.25)

    await act(async () =>
      root?.render(createElement(Probe, { observedPageUrl: "https://example.com/b" })),
    )
    expect(appliedZoomFactors.at(-1)).toBe(1.25)

    await act(async () => controls?.zoomIn())
    expect(appliedZoomFactors.at(-1)).toBe(1.5)

    await act(async () =>
      root?.render(createElement(Probe, { observedPageUrl: "http://example.com:8080/c" })),
    )
    expect(appliedZoomFactors.at(-1)).toBe(1.5)

    await act(async () => controls?.resetZoom())
    expect(appliedZoomFactors.at(-1)).toBe(1.25)
    expect(
      useInAppBrowserSettingsStore.getState().zoomFactorsByProfile[
        DEFAULT_IN_APP_BROWSER_PROFILE_ID
      ]?.[exampleHost],
    ).toBeUndefined()
  })

  test("applies zoom from the attached guest URL instead of stale rendered navigation state", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    const exampleHost = parseInAppBrowserZoomHost("https://example.com")
    const otherHost = parseInAppBrowserZoomHost("https://other.example")
    if (!exampleHost || !otherHost) throw new Error("Expected test hosts")
    useInAppBrowserSettingsStore.setState({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      zoomFactorsByProfile: {
        [DEFAULT_IN_APP_BROWSER_PROFILE_ID]: {
          [exampleHost]: 1.5,
          [otherHost]: 0.75,
        },
      },
    })

    const appliedZoomFactors: number[] = []
    const webview = createWebview((factor) => appliedZoomFactors.push(factor))
    const withWebview: WithInAppBrowserWebview = (action) => action(webview)
    let controls: ReturnType<typeof useBrowserPageControls> | undefined

    function Probe() {
      controls = useBrowserPageControls({
        tabID: "browser-tab",
        profileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
        browser,
        webContentsID: 42,
        observedPageUrl: "https://example.com/a",
        withWebview,
      })
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(createElement(Probe)))
    expect(appliedZoomFactors.at(-1)).toBe(1.5)

    controls?.synchronizeAttachedState(webview, 42, "https://other.example/page")
    expect(appliedZoomFactors.at(-1)).toBe(0.75)
  })
})
