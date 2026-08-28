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

function requireInstalledHandler<THandler>(handler: THandler | undefined, name: string): THandler {
  if (handler === undefined) throw new Error(`${name} handler was not installed`)
  return handler
}

describe("in-app Browser session boundary", () => {
  test("allows only sanitized clipboard writes, blocks downloads, and tears down handlers", () => {
    type PermissionRequestHandler = NonNullable<
      Parameters<InAppBrowserSessionBoundary["setPermissionRequestHandler"]>[0]
    >
    type PermissionCheckHandler = NonNullable<
      Parameters<InAppBrowserSessionBoundary["setPermissionCheckHandler"]>[0]
    >
    let requestHandler: PermissionRequestHandler | undefined
    let checkHandler: PermissionCheckHandler | undefined
    let downloadHandler: Parameters<InAppBrowserSessionBoundary["onWillDownload"]>[0] | undefined
    let requestHandlerCleared = false
    let checkHandlerCleared = false
    let downloadDisposed = false
    let userAgent = "Mozilla Electron/41.0 Chrome/140.0 Buddy/0.0.63"
    const dispose = configureInAppBrowserSessionBoundary({
      getUserAgent: () => userAgent,
      setUserAgent: (nextUserAgent) => {
        userAgent = nextUserAgent
      },
      setPermissionRequestHandler: (handler) => {
        if (handler) requestHandler = handler
        else requestHandlerCleared = true
      },
      setPermissionCheckHandler: (handler) => {
        if (handler) checkHandler = handler
        else checkHandlerCleared = true
      },
      onWillDownload(handler) {
        downloadHandler = handler
        return () => {
          downloadDisposed = true
        }
      },
    })

    expect(userAgent).toBe("Mozilla Chrome/140.0")
    const installedRequestHandler = requireInstalledHandler(requestHandler, "Permission request")
    const installedCheckHandler = requireInstalledHandler(checkHandler, "Permission check")
    const installedDownloadHandler = requireInstalledHandler(downloadHandler, "Download")
    const permissionResults: boolean[] = []
    installedRequestHandler("clipboard-sanitized-write", (allowed) =>
      permissionResults.push(allowed),
    )
    installedRequestHandler("camera", (allowed) => permissionResults.push(allowed))
    expect(permissionResults).toEqual([true, false])
    expect(installedCheckHandler("clipboard-sanitized-write")).toBe(true)
    expect(installedCheckHandler("notifications")).toBe(false)

    let prevented = false
    const messages: string[] = []
    installedDownloadHandler(
      { preventDefault: () => (prevented = true) },
      { sendMessage: (message) => messages.push(message) },
    )
    expect(prevented).toBe(true)
    expect(messages).toEqual([IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE])

    dispose()
    expect(downloadDisposed).toBe(true)
    expect(requestHandlerCleared).toBe(true)
    expect(checkHandlerCleared).toBe(true)
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
    expect(webPreferences.preload).toBeUndefined()
    expect(webPreferences.sandbox).toBe(true)
    expect(webPreferences.nodeIntegration).toBe(false)
    expect(webPreferences.nodeIntegrationInSubFrames).toBe(false)
    expect(webPreferences.contextIsolation).toBe(true)
  })
})

describe("in-app Browser guest wiring", () => {
  test("replaces popups, guards navigation and redirects, and removes listeners on teardown", async () => {
    let willAttach: Parameters<InAppBrowserHostBoundary["onWillAttachWebview"]>[0] | undefined
    let didAttach: Parameters<InAppBrowserHostBoundary["onDidAttachWebview"]>[0] | undefined
    let popupHandler: Parameters<InAppBrowserGuestBoundary["setWindowOpenHandler"]>[0] | undefined
    let navigateHandler: Parameters<InAppBrowserGuestBoundary["onWillNavigate"]>[0] | undefined
    let redirectHandler: Parameters<InAppBrowserGuestBoundary["onWillRedirect"]>[0] | undefined
    let destroyedHandler: Parameters<InAppBrowserGuestBoundary["onDestroyed"]>[0] | undefined
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
    const installedWillAttach = requireInstalledHandler(willAttach, "Will-attach")
    const installedDidAttach = requireInstalledHandler(didAttach, "Did-attach")
    const preferences = { preload: "/tmp/preload.js" }
    let preventedAttach = false
    installedWillAttach({ preventDefault: () => (preventedAttach = true) }, preferences, {
      partition: IN_APP_BROWSER_PARTITION,
      src: "https://hibuddy.in",
    })
    expect(preventedAttach).toBe(false)
    expect(preferences.preload).toBeUndefined()
    installedDidAttach(guest)

    const installedPopupHandler = requireInstalledHandler(popupHandler, "Popup")
    const installedNavigateHandler = requireInstalledHandler(navigateHandler, "Navigate")
    const installedRedirectHandler = requireInstalledHandler(redirectHandler, "Redirect")
    const installedDestroyedHandler = requireInstalledHandler(destroyedHandler, "Destroyed")

    expect(installedPopupHandler("https://hibuddy.in/popup")).toEqual({ action: "deny" })
    await Promise.resolve()
    expect(loadedUrls).toEqual(["https://hibuddy.in/popup"])
    expect(installedPopupHandler("mailto:hello@hibuddy.in")).toEqual({ action: "deny" })
    expect(messages).toEqual([IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE])

    let preventedNavigate = false
    installedNavigateHandler(
      { preventDefault: () => (preventedNavigate = true) },
      "https://hibuddy.in/account",
    )
    expect(preventedNavigate).toBe(false)
    let preventedRedirect = false
    installedRedirectHandler(
      { preventDefault: () => (preventedRedirect = true) },
      "javascript:alert(1)",
    )
    expect(preventedRedirect).toBe(true)
    expect(messages).toEqual([
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
    ])

    installedDestroyedHandler()
    expect(disposals).toEqual(["navigate", "redirect", "destroyed"])
    dispose()
    expect(disposals).toEqual(["navigate", "redirect", "destroyed", "will-attach", "did-attach"])
  })
})
