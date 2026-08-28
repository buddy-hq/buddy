import { describe, expect, test } from "bun:test"
import { IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  createInAppBrowserNavigationTracker,
  inAppBrowserFaviconForUrl,
  inAppBrowserMainFrameLoadFailure,
  inAppBrowserRuntimeAfterLoadStopped,
  readInAppBrowserWebviewSnapshot,
  runTrackedInAppBrowserNavigation,
} from "../src/lib/in-app-browser-events"
import type { InAppBrowserTabRuntime } from "../src/state/in-app-browser-tabs-store"

function failedLoadEvent(input: {
  errorCode: number
  errorDescription: string
  isMainFrame: boolean
}): Event {
  const event = new Event("did-fail-load")
  Object.defineProperties(event, {
    errorCode: { value: input.errorCode },
    errorDescription: { value: input.errorDescription },
    isMainFrame: { value: input.isMainFrame },
  })
  return event
}

describe("in-app Browser load failures", () => {
  test("reports a main-frame failure", () => {
    expect(
      inAppBrowserMainFrameLoadFailure(
        failedLoadEvent({
          errorCode: -105,
          errorDescription: "ERR_NAME_NOT_RESOLVED",
          isMainFrame: true,
        }),
      ),
    ).toBe("ERR_NAME_NOT_RESOLVED")
  })

  test("ignores subframe and aborted-load failures", () => {
    expect(
      inAppBrowserMainFrameLoadFailure(
        failedLoadEvent({
          errorCode: -105,
          errorDescription: "ERR_NAME_NOT_RESOLVED",
          isMainFrame: false,
        }),
      ),
    ).toBeNull()
    expect(
      inAppBrowserMainFrameLoadFailure(
        failedLoadEvent({
          errorCode: -3,
          errorDescription: "ERR_ABORTED",
          isMainFrame: true,
        }),
      ),
    ).toBeNull()
  })
})

const CURRENT_RUNTIME = {
  url: "https://example.com/old",
  title: "Old",
  loading: true,
  canGoBack: false,
  canGoForward: false,
  favicon: null,
  error: null,
} satisfies InAppBrowserTabRuntime

describe("in-app Browser webview synchronization", () => {
  test("preserves a failed-load error when Electron later stops loading", () => {
    const failed = {
      ...CURRENT_RUNTIME,
      loading: false,
      error: "ERR_NAME_NOT_RESOLVED",
    }

    expect(
      inAppBrowserRuntimeAfterLoadStopped(failed, {
        ...failed,
        title: "example.com",
        loading: false,
      }),
    ).toEqual({
      ...failed,
      title: "example.com",
    })
  })

  test("keeps a favicon only for the page origin that produced it", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://example.com",
      capturedAt: 1,
    }
    expect(inAppBrowserFaviconForUrl(favicon, "https://example.com/account")).toBe(favicon)
    expect(inAppBrowserFaviconForUrl(favicon, "https://other.example/")).toBeNull()
    expect(inAppBrowserFaviconForUrl(favicon, "about:blank")).toBeNull()
  })

  test("reads already-attached state even when attachment events fired before registration", () => {
    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => "https://example.com/attached",
          getTitle: () => " Attached\npage ",
          isLoading: () => false,
          canGoBack: () => true,
          canGoForward: () => false,
        },
        CURRENT_RUNTIME,
      ),
    ).toEqual({
      webContentsID: 42,
      runtime: {
        ...CURRENT_RUNTIME,
        url: "https://example.com/attached",
        title: "Attached page",
        loading: false,
        canGoBack: true,
      },
    })
  })

  test("returns null while the webview has not attached", () => {
    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId() {
            throw new Error("The guest is not attached.")
          },
          getURL: () => "",
          getTitle: () => "",
          isLoading: () => true,
          canGoBack: () => false,
          canGoForward: () => false,
        },
        CURRENT_RUNTIME,
      ),
    ).toBeNull()
  })

  test("does not publish an oversized observed URL into Browser context", () => {
    const oversizedUrl = `https://example.com/${"x".repeat(IN_APP_BROWSER_URL_MAX_LENGTH)}`
    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => oversizedUrl,
          getTitle: () => "Oversized",
          isLoading: () => false,
          canGoBack: () => true,
          canGoForward: () => false,
        },
        CURRENT_RUNTIME,
      )?.runtime.url,
    ).toBe(CURRENT_RUNTIME.url)
  })
})

describe("in-app Browser address navigation", () => {
  test("ignores an older rejection after a newer navigation succeeds", async () => {
    const tracker = createInAppBrowserNavigationTracker()
    let rejectFirst: (() => void) | undefined
    const failures: string[] = []
    const first = runTrackedInAppBrowserNavigation({
      url: "https://example.com/first",
      tracker,
      loadURL: () =>
        new Promise((_resolve, reject) => {
          rejectFirst = () => reject(new Error("ERR_ABORTED"))
        }),
      onCurrentFailure: () => failures.push("first"),
    })
    const second = runTrackedInAppBrowserNavigation({
      url: "https://example.com/second",
      tracker,
      loadURL: async () => undefined,
      onCurrentFailure: () => failures.push("second"),
    })

    await second
    rejectFirst?.()
    await first

    expect(failures).toEqual([])
  })
})
