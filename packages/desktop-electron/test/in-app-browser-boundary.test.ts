import { describe, expect, test } from "bun:test"
import {
  IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
  type AppShortcutInput,
} from "@buddy/browser-contract"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  inAppBrowserProfilePartition,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import {
  applyInAppBrowserWebviewAttachmentPolicy,
  configureInAppBrowserSessionBoundary,
  IN_APP_BROWSER_POPUP_WINDOW_OPTIONS,
  isInAppBrowserEditingShortcut,
  wireInAppBrowserHostBoundary,
  type InAppBrowserGuestBoundary,
  type InAppBrowserHostBoundary,
  type InAppBrowserSessionBoundary,
} from "../src/main/in-app-browser-boundary"

const DEFAULT_PARTITION = inAppBrowserProfilePartition(DEFAULT_IN_APP_BROWSER_PROFILE_ID)

function requireInstalledHandler<THandler>(handler: THandler | undefined, name: string): THandler {
  if (handler === undefined) throw new Error(`${name} handler was not installed`)
  return handler
}

function keyDown(overrides: Partial<AppShortcutInput>): AppShortcutInput {
  return {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    isAutoRepeat: false,
    isComposing: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
    ...overrides,
  }
}

describe("in-app Browser session boundary", () => {
  test("grants only the page permissions Buddy allows and tears down handlers", () => {
    type PermissionRequestHandler = NonNullable<
      Parameters<InAppBrowserSessionBoundary["setPermissionRequestHandler"]>[0]
    >
    type PermissionCheckHandler = NonNullable<
      Parameters<InAppBrowserSessionBoundary["setPermissionCheckHandler"]>[0]
    >
    let requestHandler: PermissionRequestHandler | undefined
    let checkHandler: PermissionCheckHandler | undefined
    let requestHandlerCleared = false
    let checkHandlerCleared = false
    const dispose = configureInAppBrowserSessionBoundary({
      setPermissionRequestHandler: (handler) => {
        if (handler) requestHandler = handler
        else requestHandlerCleared = true
      },
      setPermissionCheckHandler: (handler) => {
        if (handler) checkHandler = handler
        else checkHandlerCleared = true
      },
    })

    const installedRequestHandler = requireInstalledHandler(requestHandler, "Permission request")
    const installedCheckHandler = requireInstalledHandler(checkHandler, "Permission check")
    const permissionResults: Record<string, boolean> = {}
    for (const permission of [
      "clipboard-read",
      "clipboard-sanitized-write",
      "notifications",
      "geolocation",
      "media",
      "local-fonts",
    ]) {
      installedRequestHandler(permission, (allowed) => (permissionResults[permission] = allowed))
    }
    expect(permissionResults).toEqual({
      "clipboard-read": true,
      "clipboard-sanitized-write": true,
      notifications: true,
      geolocation: true,
      media: false,
      "local-fonts": false,
    })
    expect(installedCheckHandler("clipboard-sanitized-write")).toBe(true)
    expect(installedCheckHandler("media")).toBe(false)

    dispose()
    expect(requestHandlerCleared).toBe(true)
    expect(checkHandlerCleared).toBe(true)
  })
})

describe("in-app Browser webview attachment boundary", () => {
  test("rejects partitions and URLs Buddy does not own", () => {
    for (const params of [
      { partition: "persist:other", src: "https://hibuddy.in" },
      { partition: "persist:buddy-browser-profile-default", src: "https://hibuddy.in" },
      { partition: DEFAULT_PARTITION, src: "file:///tmp/private.txt" },
      { src: "https://hibuddy.in" },
    ]) {
      let prevented = false
      expect(
        applyInAppBrowserWebviewAttachmentPolicy({
          event: { preventDefault: () => (prevented = true) },
          webPreferences: {},
          params,
        }),
      ).toBeUndefined()
      expect(prevented).toBe(true)
    }
  })

  test("returns the profile behind the partition and forces isolated guest preferences", () => {
    const workProfileID = parseInAppBrowserProfileID("work-1")
    if (!workProfileID) throw new Error("Expected a valid profile ID.")
    let prevented = false
    const webPreferences: Parameters<
      typeof applyInAppBrowserWebviewAttachmentPolicy
    >[0]["webPreferences"] = {
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
        params: { partition: "persist:buddy-browser-profile-work-1", src: "about:blank" },
      }),
    ).toBe(workProfileID)
    expect(prevented).toBe(false)
    expect(webPreferences).toEqual({
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
    })
  })
})

describe("in-app Browser native editing shortcuts", () => {
  test("allows only platform editing chords through the native menu", () => {
    for (const key of ["a", "c", "v", "x", "z"]) {
      expect(isInAppBrowserEditingShortcut(keyDown({ key, meta: true }), "macos")).toBe(true)
      expect(isInAppBrowserEditingShortcut(keyDown({ key, control: true }), "windows")).toBe(true)
    }
    expect(
      isInAppBrowserEditingShortcut(
        keyDown({ key: "v", code: "KeyV", meta: true, shift: true, alt: true }),
        "macos",
      ),
    ).toBe(true)
    expect(
      isInAppBrowserEditingShortcut(keyDown({ key: "y", code: "KeyY", control: true }), "windows"),
    ).toBe(true)
    expect(
      isInAppBrowserEditingShortcut(keyDown({ key: "w", code: "KeyW", meta: true }), "macos"),
    ).toBe(false)
    expect(
      isInAppBrowserEditingShortcut(keyDown({ key: "c", code: "KeyC", control: true }), "macos"),
    ).toBe(false)
  })
})

describe("in-app Browser guest wiring", () => {
  test("opens popups, routes shortcuts, guards navigation, and removes listeners on teardown", async () => {
    let willAttach: Parameters<InAppBrowserHostBoundary["onWillAttachWebview"]>[0] | undefined
    let didAttach: Parameters<InAppBrowserHostBoundary["onDidAttachWebview"]>[0] | undefined
    let popupHandler: Parameters<InAppBrowserGuestBoundary["setWindowOpenHandler"]>[0] | undefined
    let navigateHandler: Parameters<InAppBrowserGuestBoundary["onWillFrameNavigate"]>[0] | undefined
    let redirectHandler: Parameters<InAppBrowserGuestBoundary["onWillRedirect"]>[0] | undefined
    let inputHandler: Parameters<InAppBrowserGuestBoundary["onBeforeInputEvent"]>[0] | undefined
    let destroyedHandler: Parameters<InAppBrowserGuestBoundary["onDestroyed"]>[0] | undefined
    const disposals: string[] = []
    const loadedUrls: string[] = []
    const messages: string[] = []
    const appShortcuts: string[] = []
    const browserShortcuts: string[] = []
    const attachingProfiles: string[] = []
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
      sendShortcut: (shortcut) => browserShortcuts.push(shortcut),
      setWindowOpenHandler(handler) {
        popupHandler = handler
      },
      onWillFrameNavigate(handler) {
        navigateHandler = handler
        return () => disposals.push("navigate")
      },
      onWillRedirect(handler) {
        redirectHandler = handler
        return () => disposals.push("redirect")
      },
      onBeforeInputEvent(handler) {
        inputHandler = handler
        return () => disposals.push("before-input")
      },
      onDestroyed(handler) {
        destroyedHandler = handler
        return () => disposals.push("destroyed")
      },
    }

    const dispose = wireInAppBrowserHostBoundary(host, {
      platform: "macos",
      onShortcut: (shortcutID) => appShortcuts.push(shortcutID),
      onProfileAttaching: (profileID) => attachingProfiles.push(profileID),
    })
    requireInstalledHandler(willAttach, "Will-attach")(
      { preventDefault: () => undefined },
      {},
      { partition: DEFAULT_PARTITION, src: "https://hibuddy.in" },
    )
    expect(attachingProfiles).toEqual([DEFAULT_IN_APP_BROWSER_PROFILE_ID])
    requireInstalledHandler(didAttach, "Did-attach")(guest)

    const installedPopupHandler = requireInstalledHandler(popupHandler, "Popup")
    expect(
      installedPopupHandler({
        url: "https://accounts.hibuddy.in/login",
        disposition: "new-window",
        frameName: "_blank",
      }),
    ).toEqual({
      action: "allow",
      overrideBrowserWindowOptions: IN_APP_BROWSER_POPUP_WINDOW_OPTIONS,
    })
    expect(
      installedPopupHandler({ url: "about:blank", disposition: "new-window", frameName: "" }),
    ).toEqual({
      action: "allow",
      overrideBrowserWindowOptions: IN_APP_BROWSER_POPUP_WINDOW_OPTIONS,
    })
    expect(
      installedPopupHandler({
        url: "https://accounts.hibuddy.in/login",
        disposition: "foreground-tab",
        frameName: "oauth",
      }),
    ).toEqual({
      action: "allow",
      overrideBrowserWindowOptions: IN_APP_BROWSER_POPUP_WINDOW_OPTIONS,
    })
    expect(
      installedPopupHandler({
        url: "https://hibuddy.in/next",
        disposition: "foreground-tab",
        frameName: "ordinary",
      }),
    ).toEqual({ action: "deny" })
    await Promise.resolve()
    expect(loadedUrls).toEqual(["https://hibuddy.in/next"])
    expect(
      installedPopupHandler({
        url: "mailto:hello@hibuddy.in",
        disposition: "new-window",
        frameName: "_blank",
      }),
    ).toEqual({ action: "deny" })
    expect(messages).toEqual([IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE])

    let preventedNavigate = false
    requireInstalledHandler(navigateHandler, "Navigate")(
      { preventDefault: () => (preventedNavigate = true) },
      "https://hibuddy.in/account",
    )
    expect(preventedNavigate).toBe(false)
    let preventedScriptNavigation = false
    requireInstalledHandler(navigateHandler, "Navigate")(
      { preventDefault: () => (preventedScriptNavigation = true) },
      "javascript:alert(1)",
    )
    expect(preventedScriptNavigation).toBe(true)
    let preventedRedirect = false
    requireInstalledHandler(redirectHandler, "Redirect")(
      { preventDefault: () => (preventedRedirect = true) },
      "javascript:alert(1)",
    )
    expect(preventedRedirect).toBe(true)
    expect(messages).toEqual([
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
      IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
    ])

    const installedInputHandler = requireInstalledHandler(inputHandler, "Before-input")
    const pressed = (input: AppShortcutInput) => {
      let prevented = false
      installedInputHandler({ preventDefault: () => (prevented = true) }, input)
      return prevented
    }
    expect(pressed(keyDown({ key: "l", code: "KeyL", meta: true }))).toBe(true)
    expect(pressed(keyDown({ key: "n", code: "KeyN", meta: true }))).toBe(true)
    expect(pressed(keyDown({ key: "a", code: "KeyA" }))).toBe(false)
    expect(browserShortcuts).toEqual(["focusAddress"])
    expect(appShortcuts).toEqual(["chat.new"])

    requireInstalledHandler(destroyedHandler, "Destroyed")()
    expect(disposals).toEqual(["navigate", "redirect", "before-input", "destroyed"])
    dispose()
    expect(disposals).toEqual([
      "navigate",
      "redirect",
      "before-input",
      "destroyed",
      "will-attach",
      "did-attach",
    ])
  })
})
