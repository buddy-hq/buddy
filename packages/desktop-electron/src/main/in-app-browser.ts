import {
  IN_APP_BROWSER_BLANK_URL,
  IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE,
  IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH,
  type AppShortcutPlatform,
} from "@buddy/browser-contract"
import {
  Menu,
  clipboard,
  nativeImage,
  webContents,
  type BrowserWindow,
  type ContextMenuParams,
  type Event as ElectronEvent,
  type Input,
  type WebContents,
  type WebContentsAudioStateChangedEventParams,
  type WebContentsWillFrameNavigateEventParams,
  type WebPreferences,
} from "electron"
import {
  captureInAppBrowserFavicon,
  inAppBrowserSafeHttpOrigin,
  selectInAppBrowserFaviconCandidates,
} from "./in-app-browser-favicon"
import {
  isInAppBrowserEditingShortcut,
  wireInAppBrowserHostBoundary,
  type InAppBrowserGuestBoundary,
} from "./in-app-browser-boundary"
import {
  attachInAppBrowserCitations,
  requestInAppBrowserCitation,
} from "./in-app-browser-citations"
import { inAppBrowserContextMenuTemplate } from "./in-app-browser-context-menu"
import {
  sendInAppBrowserAudio,
  sendInAppBrowserFavicon,
  sendInAppBrowserNotice,
  sendInAppBrowserShortcut,
} from "./in-app-browser-host-messages"
import { installInAppBrowserMouseNavigation } from "./in-app-browser-mouse-navigation"
import {
  guardInAppBrowserNavigation,
  installInAppBrowserNavigationBlockedNotice,
} from "./in-app-browser-navigation"
import { inAppBrowserProfileSession } from "./in-app-browser-session"

const IN_APP_BROWSER_FAVICON_EDGE_PX = 32
const IN_APP_BROWSER_FAVICON_MAX_SOURCE_PIXELS = 1_048_576

type Dispose = () => void

type TInAppBrowserFaviconCaptureFailure = {
  readonly operation: "captureFavicon"
  readonly webContentsID: number
  readonly pageOrigin: string
  readonly candidateCount: number
}

function warnInAppBrowserFaviconCaptureFailed(details: TInAppBrowserFaviconCaptureFailure): void {
  console.warn("in-app browser favicon capture failed", details)
}

function currentShortcutPlatform(): AppShortcutPlatform {
  if (process.platform === "darwin") return "macos"
  if (process.platform === "win32") return "windows"
  return "linux"
}

function rasterizeBrowserFavicon(bytes: Uint8Array): string | null {
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) return null
  const size = image.getSize()
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width * size.height > IN_APP_BROWSER_FAVICON_MAX_SOURCE_PIXELS
  ) {
    return null
  }
  const scale = Math.min(
    IN_APP_BROWSER_FAVICON_EDGE_PX / size.width,
    IN_APP_BROWSER_FAVICON_EDGE_PX / size.height,
  )
  const resized = image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "best",
  })
  if (resized.isEmpty()) return null
  const dataUrl = `data:image/png;base64,${resized.toPNG().toString("base64")}`
  return dataUrl.length <= IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH ? dataUrl : null
}

function attachInAppBrowserFaviconCapture(webContents: WebContents): Dispose {
  let disposed = false
  let documentGeneration = 0
  let requestGeneration = 0
  let activeController: AbortController | null = null

  const cancelCapture = () => {
    documentGeneration += 1
    activeController?.abort()
    activeController = null
  }
  const faviconUpdated = (_event: ElectronEvent, rawCandidates: string[]) => {
    const pageUrl = webContents.getURL()
    const pageOrigin = inAppBrowserSafeHttpOrigin(pageUrl)
    const candidates = selectInAppBrowserFaviconCandidates(rawCandidates)
    if (!pageOrigin || candidates.length === 0) return

    activeController?.abort()
    const captureDocumentGeneration = documentGeneration
    const captureRequestGeneration = ++requestGeneration
    const controller = new AbortController()
    activeController = controller
    const webContentsID = webContents.id
    const captureIsCurrent = (): boolean =>
      !disposed &&
      !controller.signal.aborted &&
      !webContents.isDestroyed() &&
      captureDocumentGeneration === documentGeneration &&
      captureRequestGeneration === requestGeneration &&
      inAppBrowserSafeHttpOrigin(webContents.getURL()) === pageOrigin
    const warnCaptureFailed = (): void => {
      warnInAppBrowserFaviconCaptureFailed({
        operation: "captureFavicon",
        webContentsID,
        pageOrigin,
        candidateCount: candidates.length,
      })
    }

    void captureInAppBrowserFavicon({
      pageUrl,
      candidates,
      signal: controller.signal,
      fetchResponse: (url, init) =>
        url.startsWith("data:")
          ? globalThis.fetch(url, init)
          : webContents.session.fetch(url, init),
      rasterize: rasterizeBrowserFavicon,
    })
      .then((dataUrl) => {
        if (!captureIsCurrent()) return
        if (!dataUrl) {
          warnCaptureFailed()
          return
        }
        sendInAppBrowserFavicon(webContents, {
          dataUrl,
          pageUrl: pageOrigin,
          capturedAt: Date.now(),
        })
      })
      .catch(() => {
        if (captureIsCurrent()) warnCaptureFailed()
      })
  }
  const navigationStarted = (
    event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ) => {
    if (event.isMainFrame && !event.isSameDocument) cancelCapture()
  }

  webContents.on("page-favicon-updated", faviconUpdated)
  webContents.on("did-start-navigation", navigationStarted)
  return () => {
    disposed = true
    cancelCapture()
    webContents.removeListener("page-favicon-updated", faviconUpdated)
    webContents.removeListener("did-start-navigation", navigationStarted)
  }
}

function installInAppBrowserContextMenu(
  window: BrowserWindow,
  contents: WebContents,
  onCite?: () => void,
): Dispose {
  const show = (_event: ElectronEvent, params: ContextMenuParams) => {
    if (contents.isDestroyed() || window.isDestroyed()) return
    // Editing roles target the focused contents, which is Buddy until the page is focused.
    contents.focus()
    const template = inAppBrowserContextMenuTemplate(params, {
      replaceMisspelling: (suggestion) => {
        if (!contents.isDestroyed()) contents.replaceMisspelling(suggestion)
      },
      copyText: (text) => clipboard.writeText(text),
      copyImage: () => {
        if (!contents.isDestroyed()) contents.copyImageAt(params.x, params.y)
      },
      cite: params.frame === contents.mainFrame ? onCite : undefined,
    })
    Menu.buildFromTemplate(template).popup(
      Object.assign({ window }, params.frame ? { frame: params.frame } : undefined),
    )
  }
  contents.on("context-menu", show)
  return () => contents.removeListener("context-menu", show)
}

function forwardInAppBrowserAudioState(guest: WebContents): Dispose {
  const changed = (event: ElectronEvent<WebContentsAudioStateChangedEventParams>) => {
    sendInAppBrowserAudio(guest, event.audible)
  }
  guest.on("audio-state-changed", changed)
  return () => guest.removeListener("audio-state-changed", changed)
}

function guardPopupNavigation(event: ElectronEvent<WebContentsWillFrameNavigateEventParams>): void {
  if (event.url === IN_APP_BROWSER_BLANK_URL) return
  guardInAppBrowserNavigation({ event, url: event.url, onBlocked: () => undefined })
}

function synchronizeInAppBrowserMenuShortcuts(contents: WebContents, input: Input): void {
  if (input.type !== "keyDown") return
  contents.setIgnoreMenuShortcuts(
    !isInAppBrowserEditingShortcut(input, currentShortcutPlatform()) ||
      webContents.getFocusedWebContents() !== contents,
  )
}

function hardenInAppBrowserPopups(guest: WebContents): Dispose {
  const popupDisposals = new Set<Dispose>()
  const created = (popup: BrowserWindow) => {
    const contents = popup.webContents
    contents.setIgnoreMenuShortcuts(true)
    contents.setWindowOpenHandler(() => ({ action: "deny" }))
    const beforeInput = (_event: ElectronEvent, input: Input) =>
      synchronizeInAppBrowserMenuShortcuts(contents, input)
    contents.on("before-input-event", beforeInput)
    contents.on("will-frame-navigate", guardPopupNavigation)
    contents.on("will-redirect", guardPopupNavigation)
    const disposeContextMenu = installInAppBrowserContextMenu(popup, contents)
    const disposeMouseNavigation = installInAppBrowserMouseNavigation(contents)
    const dispose = () => {
      if (!popupDisposals.delete(dispose)) return
      popup.removeListener("closed", dispose)
      contents.removeListener("before-input-event", beforeInput)
      contents.removeListener("will-frame-navigate", guardPopupNavigation)
      contents.removeListener("will-redirect", guardPopupNavigation)
      disposeContextMenu()
      disposeMouseNavigation()
    }
    popupDisposals.add(dispose)
    popup.once("closed", dispose)
  }
  guest.on("did-create-window", created)
  return () => {
    guest.removeListener("did-create-window", created)
    for (const dispose of popupDisposals) dispose()
  }
}

function attachInAppBrowserGuestFeatures(window: BrowserWindow, guest: WebContents): Dispose {
  guest.setIgnoreMenuShortcuts(true)
  const disposers = [
    attachInAppBrowserFaviconCapture(guest),
    installInAppBrowserMouseNavigation(guest),
    installInAppBrowserContextMenu(window, guest, () => requestInAppBrowserCitation(guest)),
    attachInAppBrowserCitations(guest),
    forwardInAppBrowserAudioState(guest),
    hardenInAppBrowserPopups(guest),
    installInAppBrowserNavigationBlockedNotice(guest, () =>
      sendInAppBrowserNotice(guest, IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE),
    ),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

function browserGuestBoundary(guest: WebContents): InAppBrowserGuestBoundary {
  return {
    loadURL: (url) => guest.loadURL(url),
    sendMessage: (message) => sendInAppBrowserNotice(guest, message),
    sendShortcut: (shortcut) => sendInAppBrowserShortcut(guest, shortcut),
    setWindowOpenHandler(handler) {
      guest.setWindowOpenHandler(({ url, disposition, frameName }) =>
        handler({ url, disposition, frameName }),
      )
    },
    onWillFrameNavigate(handler) {
      const listener = (event: ElectronEvent<WebContentsWillFrameNavigateEventParams>) =>
        handler(event, event.url)
      guest.on("will-frame-navigate", listener)
      return () => guest.removeListener("will-frame-navigate", listener)
    },
    onWillRedirect(handler) {
      guest.on("will-redirect", handler)
      return () => guest.removeListener("will-redirect", handler)
    },
    onBeforeInputEvent(handler) {
      const listener = (event: ElectronEvent, input: Input) => {
        synchronizeInAppBrowserMenuShortcuts(guest, input)
        handler(event, input)
      }
      guest.on("before-input-event", listener)
      return () => guest.removeListener("before-input-event", listener)
    },
    onDestroyed(handler) {
      guest.once("destroyed", handler)
      return () => guest.removeListener("destroyed", handler)
    },
  }
}

export function wireInAppBrowser(window: BrowserWindow): Dispose {
  const hostWebContents = window.webContents
  const featureDisposals = new Set<Dispose>()
  const attachFeatures = (_event: ElectronEvent, guest: WebContents) => {
    const disposeFeatures = attachInAppBrowserGuestFeatures(window, guest)
    const dispose = () => {
      if (!featureDisposals.delete(dispose)) return
      disposeFeatures()
    }
    featureDisposals.add(dispose)
    guest.once("destroyed", dispose)
  }
  hostWebContents.on("did-attach-webview", attachFeatures)
  const disposeBoundary = wireInAppBrowserHostBoundary(
    {
      onWillAttachWebview(handler) {
        const listener = (
          event: ElectronEvent,
          webPreferences: WebPreferences,
          params: Record<string, string>,
        ) => handler(event, webPreferences, params)
        hostWebContents.on("will-attach-webview", listener)
        return () => hostWebContents.removeListener("will-attach-webview", listener)
      },
      onDidAttachWebview(handler) {
        const listener = (_event: ElectronEvent, webContents: WebContents) => {
          handler(browserGuestBoundary(webContents))
        }
        hostWebContents.on("did-attach-webview", listener)
        return () => hostWebContents.removeListener("did-attach-webview", listener)
      },
    },
    {
      platform: currentShortcutPlatform(),
      onShortcut: (shortcutID) => {
        if (!hostWebContents.isDestroyed()) hostWebContents.send("menu-command", shortcutID)
      },
      onProfileAttaching: (profileID) => {
        inAppBrowserProfileSession(profileID)
      },
    },
  )
  return () => {
    disposeBoundary()
    hostWebContents.removeListener("did-attach-webview", attachFeatures)
    for (const dispose of featureDisposals) dispose()
  }
}
