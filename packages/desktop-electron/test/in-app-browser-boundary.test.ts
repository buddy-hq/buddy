import { describe, expect, test } from "bun:test"
import {
  IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE,
  IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
  IN_APP_BROWSER_PARTITION,
} from "@buddy/browser-contract"
import {
  applyInAppBrowserWebviewAttachmentPolicy,
  configureInAppBrowserSessionBoundary,
  wireInAppBrowserHostBoundary,
  type InAppBrowserGuestBoundary,
  type InAppBrowserHostBoundary,
  type InAppBrowserSessionBoundary,
} from "../src/main/in-app-browser-boundary"

describe("in-app Browser session boundary", () => {
  test("allows only sanitized clipboard writes, blocks downloads, and tears down handlers", () => {
    let requestHandler: Parameters<
      InAppBrowserSessionBoundary["setPermissionRequestHandler"]
    >[0] = null
    let checkHandler: Parameters<
      InAppBrowserSessionBoundary["setPermissionCheckHandler"]
    >[0] = null
    let downloadHandler: Parameters<InAppBrowserSessionBoundary["onWillDownload"]>[0]
    let downloadDisposed = false
    let userAgent = "Mozilla Electron/41.0 Chrome/140.0 Buddy/0.0.63"
    const dispose = configureInAppBrowserSessionBoundary({
      getUserAgent: () => userAgent,
      setUserAgent: (nextUserAgent) => {
        userAgent = nextUserAgent
      },
      setPermissionRequestHandler: (handler) => {
        requestHandler = handler
      },
      setPermissionCheckHandler: (handler) => {
        checkHandler = handler
      },
      onWillDownload(handler) {
        downloadHandler = handler
        return () => {
          downloadDisposed = true
        }
      },
    })

    expect(userAgent).toBe("Mozilla Chrome/140.0")
    const permissionResults: boolean[] = []
    requestHandler?.("clipboard-sanitized-write", (allowed) => permissionResults.push(allowed))
    requestHandler?.("camera", (allowed) => permissionResults.push(allowed))
    expect(permissionResults).toEqual([true, false])
    expect(checkHandler?.("clipboard-sanitized-write")).toBe(true)
    expect(checkHandler?.("notifications")).toBe(false)

    let prevented = false
    const messages: string[] = []
    downloadHandler?.(
      { preventDefault: () => (prevented = true) },
      { sendMessage: (message) => messages.push(message) },
    )
    expect(prevented).toBe(true)
    expect(messages).toEqual([IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE])

    dispose()
    expect(downloadDisposed).toBe(true)
    expect(requestHandler).toBeNull()
    expect(checkHandler).toBeNull()
  })
})

describe("in-app Browser webview attachment boundary", () => {
  test("rejects the wrong partition or URL and forces isolated guest preferences", () => {
    for (const params of [
      { partition: "persist:other", src: "https://hibuddy.in" },
      { partition: IN_APP_BROWSER_PARTITION, src: "file:///tmp/private.txt" },
    ]) {
      let prevented = false
      expect(
        applyInAppBrowserWebviewAttachmentPolicy({
          event: { preventDefault: () => (prevented = true) },
          webPreferences: {},
          params,
        }),
      ).toBe(false)
      expect(prevented).toBe(true)
    }

    let prevented = false
    const webPreferences = {
      preload: "/tmp/untrusted-preload.js",
      sandbox: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
    }
    expect(
      applyInAppBrowserWebviewAttachmentPolicy({
        event: { preventDefault: () => (prevented = true) },
        webPreferences,
        params: { partition: IN_APP_BROWSER_PARTITION, src: "https://hibuddy.in" },
      }),
    ).toBe(true)
    expect(prevented).toBe(false)
    expect(webPreferences).toEqual({
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
    })
  })
})

describe("in-app Browser guest wiring", () => {
  test("replaces popups, guards navigation and redirects, and removes listeners on teardown", async () => {
    let willAttach: Parameters<InAppBrowserHostBoundary["onWillAttachWebview"]>[0]
    let didAttach: Parameters<InAppBrowserHostBoundary["onDidAttachWebview"]>[0]
    let popupHandler: Parameters<InAppBrowserGuestBoundary["setWindowOpenHandler"]>[0]
    let navigateHandler: Parameters<InAppBrowserGuestBoundary["onWillNavigate"]>[0]
    let redirectHandler: Parameters<InAppBrowserGuestBoundary["onWillRedirect"]>[0]
    let destroyedHandler: Parameters<InAppBrowserGuestBoundary["onDestroyed"]>[0]
    const disposals: string[] = []
    const loadedUrls: string[] = []
    const messages: string[] = []
    const host: InAppBrowserHostBoundary = {
      onWillAttachWebview(handler) {
        willAttach = handler
        return () => disposals.push("will-attach")
      },
      onDidAttachWebview(handler) {
        didAttach = handler
        return () => disposals.push("did-attach")
      },
    }
    const guest: InAppBrowserGuestBoundary = {
      async loadURL(url) {
        loadedUrls.push(url)
      },
      sendMessage: (message) => messages.push(message),
      setWindowOpenHandler(handler) {
        popupHandler = handler
      },
      onWillNavigate(handler) {
        navigateHandler = handler
        return () => disposals.push("navigate")
      },
      onWillRedirect(handler) {
        redirectHandler = handler
        return () => disposals.push("redirect")
      },
      onDestroyed(handler) {
        destroyedHandler = handler
        return () => disposals.push("destroyed")
      },
    }

    const dispose = wireInAppBrowserHostBoundary(host)
    const preferences = { preload: "/tmp/preload.js" }
    let preventedAttach = false
    willAttach?.(
      { preventDefault: () => (preventedAttach = true) },
      preferences,
      { partition: IN_APP_BROWSER_PARTITION, src: "https://hibuddy.in" },
    )
    expect(preventedAttach).toBe(false)
    expect(preferences.preload).toBeUndefined()
    didAttach?.(guest)

    expect(popupHandler?.("https://hibuddy.in/popup")).toEqual({ action: "deny" })
    await Promise.resolve()
    expect(loadedUrls).toEqual(["https://hibuddy.in/popup"])
    expect(popupHandler?.("mailto:hello@hibuddy.in")).toEqual({ action: "deny" })
    expect(messages).toEqual([IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE])

    let preventedNavigate = false
    navigateHandler?.(
      { preventDefault: () => (preventedNavigate = true) },
      "https://hibuddy.in/account",
    )
    expect(preventedNavigate).toBe(false)
    let preventedRedirect = false
    redirectHandler?.(
      { preventDefault: () => (preventedRedirect = true) },
      "javascript:alert(1)",
    )
    expect(preventedRedirect).toBe(true)
    expect(messages).toEqual([
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
    ])

    destroyedHandler?.()
    expect(disposals).toEqual(["navigate", "redirect", "destroyed"])
    dispose()
    expect(disposals).toEqual([
      "navigate",
      "redirect",
      "destroyed",
      "will-attach",
      "did-attach",
    ])
  })
})
