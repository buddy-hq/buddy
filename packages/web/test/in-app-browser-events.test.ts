import { describe, expect, test } from "bun:test"
import { IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  createInAppBrowserNavigationTracker,
  inAppBrowserFaviconForUrl,
  inAppBrowserMainFrameLoadFailure,
  inAppBrowserMainFrameNavigationStart,
  inAppBrowserRuntimeAfterFavicon,
  inAppBrowserRuntimeAfterLoadStopped,
  readInAppBrowserWebviewSnapshot,
  runTrackedInAppBrowserNavigation,
  shouldApplyInAppBrowserSnapshot,
} from "../src/lib/in-app-browser-events"
import type { InAppBrowserTabRuntime } from "../src/state/in-app-browser-tabs-store"

function failedLoadEvent(input: {
  errorCode: number
  errorDescription: string
  isMainFrame: boolean
  validatedURL?: string
}): Event {
  const event = new Event("did-fail-load")
  Object.defineProperties(event, {
    errorCode: { value: input.errorCode },
    errorDescription: { value: input.errorDescription },
    isMainFrame: { value: input.isMainFrame },
    validatedURL: { value: input.validatedURL },
  })
  return event
}

function startedNavigationEvent(input: { isMainFrame: boolean; url: string }): Event {
  const event = new Event("did-start-navigation")
  Object.defineProperties(event, {
    isMainFrame: { value: input.isMainFrame },
    url: { value: input.url },
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
    ).toEqual({ code: -105, description: "ERR_NAME_NOT_RESOLVED", url: null })
  })

  test("keeps the failed destination when the previous document remains loaded", () => {
    expect(
      inAppBrowserMainFrameLoadFailure(
        failedLoadEvent({
          errorCode: -105,
          errorDescription: "ERR_NAME_NOT_RESOLVED",
          isMainFrame: true,
          validatedURL: "https://missing.example/",
        }),
      ),
    ).toEqual({
      code: -105,
      description: "ERR_NAME_NOT_RESOLVED",
      url: "https://missing.example/",
    })
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
  test("keeps a submitted URL authoritative over stale guest events", () => {
    const pendingUrl = "https://example.com/requested"
    expect(
      shouldApplyInAppBrowserSnapshot({
        pendingUrl,
        pendingNavigationObserved: false,
        observedUrl: "about:blank",
        confirmedNavigation: false,
      }),
    ).toBe(false)
    expect(
      shouldApplyInAppBrowserSnapshot({
        pendingUrl,
        pendingNavigationObserved: false,
        observedUrl: "about:blank",
        confirmedNavigation: true,
      }),
    ).toBe(false)
    expect(
      shouldApplyInAppBrowserSnapshot({
        pendingUrl,
        pendingNavigationObserved: false,
        observedUrl: pendingUrl,
        confirmedNavigation: true,
      }),
    ).toBe(true)
  })

  test("accepts a redirect only after the submitted main-frame navigation starts", () => {
    const pendingUrl = "https://example.com/requested"
    expect(
      inAppBrowserMainFrameNavigationStart(
        startedNavigationEvent({ isMainFrame: true, url: pendingUrl }),
      ),
    ).toBe(pendingUrl)
    expect(
      inAppBrowserMainFrameNavigationStart(
        startedNavigationEvent({ isMainFrame: false, url: pendingUrl }),
      ),
    ).toBeNull()
    expect(
      shouldApplyInAppBrowserSnapshot({
        pendingUrl,
        pendingNavigationObserved: true,
        observedUrl: "https://www.example.com/redirected",
        confirmedNavigation: true,
      }),
    ).toBe(true)
  })

  test("preserves a failed-load error when Electron later stops loading", () => {
    const failed = {
      ...CURRENT_RUNTIME,
      url: "https://missing.example/",
      title: "missing.example",
      loading: false,
      error: {
        _tag: "load-failed" as const,
        url: "https://missing.example/",
        code: -105,
        description: "ERR_NAME_NOT_RESOLVED",
      },
    }

    expect(
      inAppBrowserRuntimeAfterLoadStopped(failed, {
        ...CURRENT_RUNTIME,
        title: "Old document",
        loading: false,
      }),
    ).toEqual(failed)
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

  test("keeps a captured favicon when the typed URL has not followed a redirect", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://mail.google.com",
      capturedAt: 1,
    }
    expect(
      inAppBrowserRuntimeAfterFavicon({ ...CURRENT_RUNTIME, url: "https://gmail.com/" }, favicon)
        .favicon,
    ).toBe(favicon)
  })

  test("keeps a captured favicon once the guest lands on the redirected origin", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://mail.google.com",
      capturedAt: 1,
    }

    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => "https://mail.google.com/mail/u/0/",
          getTitle: () => "Inbox",
          isLoading: () => false,
          canGoBack: () => true,
          canGoForward: () => false,
        },
        { ...CURRENT_RUNTIME, url: "https://gmail.com/", favicon },
      )?.runtime.favicon,
    ).toBe(favicon)
  })

  test("does not drop a captured favicon while the guest URL is still blank", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://mail.google.com",
      capturedAt: 1,
    }
    const current = { ...CURRENT_RUNTIME, url: "https://gmail.com/", favicon }

    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => "about:blank",
          getTitle: () => "",
          isLoading: () => true,
          canGoBack: () => false,
          canGoForward: () => false,
        },
        current,
      )?.runtime.favicon,
    ).toBe(favicon)
  })

  test("does not drop a captured favicon while a redirect is still loading", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://mail.google.com",
      capturedAt: 1,
    }

    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => "https://gmail.com/",
          getTitle: () => "gmail.com",
          isLoading: () => true,
          canGoBack: () => false,
          canGoForward: () => false,
        },
        { ...CURRENT_RUNTIME, url: "https://gmail.com/", favicon },
      )?.runtime.favicon,
    ).toBe(favicon)
  })

  test("drops a captured favicon once the guest document origin changes", () => {
    const favicon = {
      dataUrl: "data:image/png;base64,AAAA",
      pageUrl: "https://mail.google.com",
      capturedAt: 1,
    }

    expect(
      readInAppBrowserWebviewSnapshot(
        {
          getWebContentsId: () => 42,
          getURL: () => "https://other.example/",
          getTitle: () => "Other",
          isLoading: () => false,
          canGoBack: () => true,
          canGoForward: () => false,
        },
        { ...CURRENT_RUNTIME, url: "https://gmail.com/", favicon },
      )?.runtime.favicon,
    ).toBeNull()
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
