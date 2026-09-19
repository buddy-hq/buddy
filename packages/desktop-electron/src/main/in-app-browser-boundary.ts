import {
  IN_APP_BROWSER_BLANK_URL,
  IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
  isAllowedInAppBrowserUrl,
  isInAppBrowserTargetUrl,
  resolveAppShortcutID,
  resolveInAppBrowserShortcutID,
  type AppShortcutID,
  type AppShortcutInput,
  type AppShortcutPlatform,
  type InAppBrowserShortcutID,
} from "@buddy/browser-contract"
import {
  parseInAppBrowserPartition,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { guardInAppBrowserNavigation } from "./in-app-browser-navigation"

const IN_APP_BROWSER_ALLOWED_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "notifications",
  "geolocation",
])

type Dispose = () => void
const NOOP_DISPOSE: Dispose = () => undefined
type PreventableEvent = { preventDefault(): void }
type InAppBrowserWebPreferences = {
  preload?: string
  sandbox?: boolean
  nodeIntegration?: boolean
  nodeIntegrationInSubFrames?: boolean
  contextIsolation?: boolean
}

export const IN_APP_BROWSER_POPUP_WINDOW_OPTIONS = {
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
} as const

export type InAppBrowserSessionBoundary = {
  setPermissionRequestHandler(
    handler: ((permission: string, callback: (allowed: boolean) => void) => void) | null,
  ): void
  setPermissionCheckHandler(handler: ((permission: string) => boolean) | null): void
}

export type InAppBrowserWindowOpenDetails = {
  readonly url: string
  readonly disposition: string
  readonly frameName: string
}

export type InAppBrowserWindowOpenResponse =
  | { action: "deny" }
  | {
      action: "allow"
      overrideBrowserWindowOptions: typeof IN_APP_BROWSER_POPUP_WINDOW_OPTIONS
    }

export type InAppBrowserGuestBoundary = {
  loadURL(url: string): Promise<void>
  sendMessage(message: string): void
  sendShortcut(shortcut: InAppBrowserShortcutID): void
  setWindowOpenHandler(
    handler: (details: InAppBrowserWindowOpenDetails) => InAppBrowserWindowOpenResponse,
  ): void
  onWillFrameNavigate(handler: (event: PreventableEvent, url: string) => void): Dispose
  onWillRedirect(handler: (event: PreventableEvent, url: string) => void): Dispose
  onBeforeInputEvent(handler: (event: PreventableEvent, input: AppShortcutInput) => void): Dispose
  onDestroyed(handler: () => void): Dispose
}

export type InAppBrowserHostPolicy = {
  platform: AppShortcutPlatform
  onShortcut(id: AppShortcutID): void
  onProfileAttaching(profileID: InAppBrowserProfileID): void
}

export type InAppBrowserHostBoundary = {
  onWillAttachWebview(
    handler: (
      event: PreventableEvent,
      webPreferences: InAppBrowserWebPreferences,
      params: { partition?: string; src?: string },
    ) => void,
  ): Dispose
  onDidAttachWebview(handler: (guest: InAppBrowserGuestBoundary) => void): Dispose
}

export function configureInAppBrowserSessionBoundary(
  boundary: InAppBrowserSessionBoundary,
): Dispose {
  boundary.setPermissionRequestHandler((permission, callback) => {
    callback(IN_APP_BROWSER_ALLOWED_PERMISSIONS.has(permission))
  })
  boundary.setPermissionCheckHandler((permission) =>
    IN_APP_BROWSER_ALLOWED_PERMISSIONS.has(permission),
  )

  return () => {
    boundary.setPermissionRequestHandler(null)
    boundary.setPermissionCheckHandler(null)
  }
}

export function applyInAppBrowserWebviewAttachmentPolicy(input: {
  event: PreventableEvent
  webPreferences: InAppBrowserWebPreferences
  params: { partition?: string; src?: string }
}): InAppBrowserProfileID | undefined {
  const profileID =
    input.params.partition === undefined
      ? undefined
      : parseInAppBrowserPartition(input.params.partition)
  if (!profileID || !input.params.src || !isInAppBrowserTargetUrl(input.params.src)) {
    input.event.preventDefault()
    return undefined
  }

  delete input.webPreferences.preload
  input.webPreferences.sandbox = true
  input.webPreferences.nodeIntegration = false
  input.webPreferences.nodeIntegrationInSubFrames = false
  input.webPreferences.contextIsolation = true
  return profileID
}

export function isInAppBrowserEditingShortcut(
  input: AppShortcutInput,
  platform: AppShortcutPlatform,
): boolean {
  const isMac = platform === "macos"
  if (isMac ? !input.meta || input.control : !input.control || input.meta) return false
  const key = input.key.toLowerCase()
  if (isMac && input.alt && input.shift && input.code === "KeyV") return true
  if (key === "v" && input.shift) return input.alt === isMac
  if (input.alt) return false
  if (key === "z") return !input.shift || platform !== "windows"
  if (input.shift) return false
  return (
    key === "a" ||
    key === "c" ||
    key === "v" ||
    key === "x" ||
    (key === "y" && platform === "windows")
  )
}

function isPopupUrl(url: string): boolean {
  return url === IN_APP_BROWSER_BLANK_URL || isAllowedInAppBrowserUrl(url)
}

function isOAuthPopup(details: InAppBrowserWindowOpenDetails): boolean {
  if (details.disposition === "new-window") return true
  return /^(?:oauth|oauth[-_ ]?popup)$/iu.test(details.frameName)
}

export function attachInAppBrowserGuestBoundary(
  guest: InAppBrowserGuestBoundary,
  policy: InAppBrowserHostPolicy,
): Dispose {
  guest.setWindowOpenHandler((details) => {
    // Sign-in SDKs treat a null window.open() as blocked and post results back to the opener.
    if (isOAuthPopup(details) && isPopupUrl(details.url)) {
      return { action: "allow", overrideBrowserWindowOptions: IN_APP_BROWSER_POPUP_WINDOW_OPTIONS }
    }
    if (isAllowedInAppBrowserUrl(details.url)) {
      void guest.loadURL(details.url).catch(() => undefined)
    } else if (details.url !== IN_APP_BROWSER_BLANK_URL) {
      guest.sendMessage(IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE)
    }
    return { action: "deny" }
  })
  const guardNavigation = (event: PreventableEvent, url: string) => {
    guardInAppBrowserNavigation({
      event,
      url,
      onBlocked: () => guest.sendMessage(IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE),
    })
  }
  const disposeNavigate = guest.onWillFrameNavigate(guardNavigation)
  const disposeRedirect = guest.onWillRedirect(guardNavigation)
  const disposeInput = guest.onBeforeInputEvent((event, input) => {
    const browserShortcut = resolveInAppBrowserShortcutID(input, policy.platform)
    if (browserShortcut) {
      event.preventDefault()
      guest.sendShortcut(browserShortcut)
      return
    }
    const shortcutID = resolveAppShortcutID(input, policy.platform)
    if (!shortcutID) return
    event.preventDefault()
    policy.onShortcut(shortcutID)
  })
  return () => {
    disposeNavigate()
    disposeRedirect()
    disposeInput()
  }
}

export function wireInAppBrowserHostBoundary(
  host: InAppBrowserHostBoundary,
  policy: InAppBrowserHostPolicy,
): Dispose {
  const guestDisposals = new Set<Dispose>()
  const disposeAttach = host.onWillAttachWebview((event, webPreferences, params) => {
    const profileID = applyInAppBrowserWebviewAttachmentPolicy({ event, webPreferences, params })
    if (profileID) policy.onProfileAttaching(profileID)
  })
  const disposeDidAttach = host.onDidAttachWebview((guest) => {
    const disposeGuest = attachInAppBrowserGuestBoundary(guest, policy)
    let disposed = false
    let disposeDestroyed: Dispose = NOOP_DISPOSE
    const dispose = () => {
      if (disposed) return
      disposed = true
      disposeGuest()
      disposeDestroyed()
      guestDisposals.delete(dispose)
    }
    disposeDestroyed = guest.onDestroyed(dispose)
    guestDisposals.add(dispose)
  })

  return () => {
    disposeAttach()
    disposeDidAttach()
    for (const disposeGuest of guestDisposals) disposeGuest()
  }
}
