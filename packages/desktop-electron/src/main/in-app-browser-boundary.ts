import {
  resolveAppShortcutID,
  IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE,
  IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
  IN_APP_BROWSER_PARTITION,
  isAllowedInAppBrowserUrl,
  isInAppBrowserTargetUrl,
  type AppShortcutID,
  type AppShortcutInput,
  type AppShortcutPlatform,
} from "@buddy/browser-contract"
import { guardInAppBrowserNavigation } from "./in-app-browser-navigation"

const IN_APP_BROWSER_ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"])

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

export type InAppBrowserSessionBoundary = {
  getUserAgent(): string
  setUserAgent(userAgent: string): void
  setPermissionRequestHandler(
    handler: ((permission: string, callback: (allowed: boolean) => void) => void) | null,
  ): void
  setPermissionCheckHandler(handler: ((permission: string) => boolean) | null): void
  onWillDownload(
    handler: (
      event: PreventableEvent,
      guest: { sendMessage(message: string): void } | null,
    ) => void,
  ): Dispose
}

export type InAppBrowserGuestBoundary = {
  loadURL(url: string): Promise<void>
  sendMessage(message: string): void
  setWindowOpenHandler(handler: (url: string) => { action: "deny" }): void
  onWillNavigate(handler: (event: PreventableEvent, url: string) => void): Dispose
  onWillRedirect(handler: (event: PreventableEvent, url: string) => void): Dispose
  onBeforeInputEvent(
    handler: (event: PreventableEvent, input: AppShortcutInput) => void,
  ): Dispose
  onDestroyed(handler: () => void): Dispose
}

/** Delivers recognized app shortcuts from an embedded browser guest to its host renderer. */
export type InAppBrowserShortcutBoundary = {
  platform: AppShortcutPlatform
  onShortcut(id: AppShortcutID): void
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
  const userAgent = boundary
    .getUserAgent()
    .replace(/Electron\/[\d.]+ /u, "")
    .replace(/\s*Buddy\/[\d.]+/iu, "")
  boundary.setUserAgent(userAgent)
  boundary.setPermissionRequestHandler((permission, callback) => {
    callback(IN_APP_BROWSER_ALLOWED_PERMISSIONS.has(permission))
  })
  boundary.setPermissionCheckHandler((permission) =>
    IN_APP_BROWSER_ALLOWED_PERMISSIONS.has(permission),
  )
  const disposeDownload = boundary.onWillDownload((event, guest) => {
    event.preventDefault()
    guest?.sendMessage(IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE)
  })

  return () => {
    disposeDownload()
    boundary.setPermissionRequestHandler(null)
    boundary.setPermissionCheckHandler(null)
  }
}

export function applyInAppBrowserWebviewAttachmentPolicy(input: {
  event: PreventableEvent
  webPreferences: InAppBrowserWebPreferences
  params: { partition?: string; src?: string }
}): boolean {
  if (
    input.params.partition !== IN_APP_BROWSER_PARTITION ||
    !input.params.src ||
    !isInAppBrowserTargetUrl(input.params.src)
  ) {
    input.event.preventDefault()
    return false
  }

  delete input.webPreferences.preload
  input.webPreferences.sandbox = true
  input.webPreferences.nodeIntegration = false
  input.webPreferences.nodeIntegrationInSubFrames = false
  input.webPreferences.contextIsolation = true
  return true
}

export function attachInAppBrowserGuestBoundary(
  guest: InAppBrowserGuestBoundary,
  shortcuts: InAppBrowserShortcutBoundary,
): Dispose {
  guest.setWindowOpenHandler((url) => {
    if (isAllowedInAppBrowserUrl(url)) {
      void guest.loadURL(url).catch(() => undefined)
    } else {
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
  const disposeNavigate = guest.onWillNavigate(guardNavigation)
  const disposeRedirect = guest.onWillRedirect(guardNavigation)
  const disposeInput = guest.onBeforeInputEvent((event, input) => {
    const shortcutID = resolveAppShortcutID(input, shortcuts.platform)
    if (!shortcutID) return
    event.preventDefault()
    shortcuts.onShortcut(shortcutID)
  })
  return () => {
    disposeNavigate()
    disposeRedirect()
    disposeInput()
  }
}

export function wireInAppBrowserHostBoundary(
  host: InAppBrowserHostBoundary,
  shortcuts: InAppBrowserShortcutBoundary,
): Dispose {
  const guestDisposals = new Set<Dispose>()
  const disposeAttach = host.onWillAttachWebview((event, webPreferences, params) => {
    applyInAppBrowserWebviewAttachmentPolicy({ event, webPreferences, params })
  })
  const disposeDidAttach = host.onDidAttachWebview((guest) => {
    const disposeGuest = attachInAppBrowserGuestBoundary(guest, shortcuts)
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
