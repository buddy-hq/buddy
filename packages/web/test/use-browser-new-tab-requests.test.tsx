import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { InAppBrowserNewTabMessage } from "@buddy/browser-contract"
import { INCOGNITO_IN_APP_BROWSER_PROFILE_ID } from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "../src/context/platform"
import type { BenchOpenRequest } from "../src/lib/bench-navigation"

const openBench = mock(async (_request: BenchOpenRequest) => ({ outcome: "committed" }))

mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

const [{ useBrowserNewTabRequests }, { BENCH_MODE_REQUEST_POLICY }] = await Promise.all([
  import("../src/components/bench/surfaces/browser/use-browser-new-tab-requests"),
  import("../src/lib/bench-navigation"),
])

let deliverNewTab: ((message: InAppBrowserNewTabMessage) => void) | undefined

const browser: InAppBrowserPlatform = {
  webPreferences: "",
  onMessage: () => () => undefined,
  onFavicon: () => () => undefined,
  onAudio: () => () => undefined,
  onShortcut: () => () => undefined,
  onNewTab: (callback) => {
    deliverNewTab = callback
    return () => {
      deliverNewTab = undefined
    }
  },
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

function Probe(props: { active: boolean }) {
  useBrowserNewTabRequests({
    browser,
    directory: "/notebook",
    profileID: INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
    webContentsID: 42,
    active: props.active,
  })
  return null
}

function requireDeliverNewTab(): (message: InAppBrowserNewTabMessage) => void {
  if (!deliverNewTab) throw new Error("Expected a new-tab listener")
  return deliverNewTab
}

describe("Browser new-tab requests", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    openBench.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("opens a page's new-tab link as a Bench Browser tab with the same profile", () => {
    act(() => root.render(<Probe active />))

    requireDeliverNewTab()({ webContentsID: 7, url: "https://example.com/other" })
    expect(openBench).not.toHaveBeenCalled()

    requireDeliverNewTab()({ webContentsID: 42, url: "https://example.com/next" })
    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench.mock.calls[0]?.[0]).toMatchObject({
      directory: "/notebook",
      target: {
        type: "browser",
        url: "https://example.com/next",
        profileID: INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
      },
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: null,
    })
  })

  test("ignores new-tab requests while its surface is parked", () => {
    act(() => root.render(<Probe active={false} />))

    requireDeliverNewTab()({ webContentsID: 42, url: "https://example.com/next" })
    expect(openBench).not.toHaveBeenCalled()
  })
})
