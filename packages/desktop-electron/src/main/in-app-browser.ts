import {
  IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH,
  IN_APP_BROWSER_FAVICON_CHANNEL,
  IN_APP_BROWSER_MESSAGE_CHANNEL,
  IN_APP_BROWSER_PARTITION,
  type InAppBrowserFaviconMessage,
  type InAppBrowserHostMessage,
} from "@buddy/browser-contract"
import {
  nativeImage,
  session,
  type BrowserWindow,
  type DownloadItem,
  type Event as ElectronEvent,
  type Session,
  type WebContents,
  type WebPreferences,
} from "electron"
import {
  captureInAppBrowserFavicon,
  inAppBrowserSafeHttpOrigin,
  selectInAppBrowserFaviconCandidates,
} from "./in-app-browser-favicon"
import {
  configureInAppBrowserSessionBoundary,
  wireInAppBrowserHostBoundary,
  type InAppBrowserGuestBoundary,
  type InAppBrowserSessionBoundary,
} from "./in-app-browser-boundary"

const IN_APP_BROWSER_FAVICON_EDGE_PX = 32
const IN_APP_BROWSER_FAVICON_MAX_SOURCE_PIXELS = 1_048_576
const configuredSessions = new WeakSet<Session>()

function sendBrowserMessage(webContents: WebContents, message: string): void {
  const host = webContents.hostWebContents
  if (!host || host.isDestroyed()) return
  const payload = {
    webContentsID: webContents.id,
    message,
  } satisfies InAppBrowserHostMessage
  host.send(IN_APP_BROWSER_MESSAGE_CHANNEL, payload)
}

function sendBrowserFavicon(
  webContents: WebContents,
  favicon: InAppBrowserFaviconMessage["favicon"],
): void {
  const host = webContents.hostWebContents
  if (!host || host.isDestroyed()) return
  const payload = {
    webContentsID: webContents.id,
    favicon,
  } satisfies InAppBrowserFaviconMessage
  host.send(IN_APP_BROWSER_FAVICON_CHANNEL, payload)
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

function attachInAppBrowserFaviconCapture(
  webContents: WebContents,
  onDisposed: () => void,
): () => void {
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
        if (
          !dataUrl ||
          disposed ||
          controller.signal.aborted ||
          webContents.isDestroyed() ||
          captureDocumentGeneration !== documentGeneration ||
          captureRequestGeneration !== requestGeneration ||
          inAppBrowserSafeHttpOrigin(webContents.getURL()) !== pageOrigin
        ) {
          return
        }
        sendBrowserFavicon(webContents, {
          dataUrl,
          pageUrl: pageOrigin,
          capturedAt: Date.now(),
        })
      })
      .catch(() => undefined)
  }
  const navigationStarted = (
    event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ) => {
    if (event.isMainFrame && !event.isSameDocument) cancelCapture()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelCapture()
    webContents.removeListener("page-favicon-updated", faviconUpdated)
    webContents.removeListener("did-start-navigation", navigationStarted)
    webContents.removeListener("destroyed", dispose)
    onDisposed()
  }

  webContents.on("page-favicon-updated", faviconUpdated)
  webContents.on("did-start-navigation", navigationStarted)
  webContents.once("destroyed", dispose)
  return dispose
}

function browserSessionBoundary(browserSession: Session): InAppBrowserSessionBoundary {
  return {
    getUserAgent: () => browserSession.getUserAgent(),
    setUserAgent: (userAgent) => browserSession.setUserAgent(userAgent),
    setPermissionRequestHandler(handler) {
      browserSession.setPermissionRequestHandler(
        handler ? (_webContents, permission, callback) => handler(permission, callback) : null,
      )
    },
    setPermissionCheckHandler(handler) {
      browserSession.setPermissionCheckHandler(
        handler ? (_webContents, permission) => handler(permission) : null,
      )
    },
    onWillDownload(handler) {
      const listener = (event: ElectronEvent, _item: DownloadItem, webContents: WebContents) => {
        handler(
          event,
          webContents
            ? { sendMessage: (message) => sendBrowserMessage(webContents, message) }
            : null,
        )
      }
      browserSession.on("will-download", listener)
      return () => browserSession.removeListener("will-download", listener)
    },
  }
}

function configureBrowserSession(): Session {
  const browserSession = session.fromPartition(IN_APP_BROWSER_PARTITION)
  if (configuredSessions.has(browserSession)) return browserSession
  configuredSessions.add(browserSession)
  configureInAppBrowserSessionBoundary(browserSessionBoundary(browserSession))
  return browserSession
}

function browserGuestBoundary(webContents: WebContents): InAppBrowserGuestBoundary {
  return {
    loadURL: (url) => webContents.loadURL(url),
    sendMessage: (message) => sendBrowserMessage(webContents, message),
    setWindowOpenHandler(handler) {
      webContents.setWindowOpenHandler(({ url }) => handler(url))
    },
    onWillNavigate(handler) {
      webContents.on("will-navigate", handler)
      return () => webContents.removeListener("will-navigate", handler)
    },
    onWillRedirect(handler) {
      webContents.on("will-redirect", handler)
      return () => webContents.removeListener("will-redirect", handler)
    },
    onDestroyed(handler) {
      webContents.once("destroyed", handler)
      return () => webContents.removeListener("destroyed", handler)
    },
  }
}

export function wireInAppBrowser(window: BrowserWindow): () => void {
  configureBrowserSession()
  const hostWebContents = window.webContents
  const faviconDisposals = new Set<() => void>()
  const faviconAttachListener = (_event: ElectronEvent, webContents: WebContents) => {
    const disposeFavicon = attachInAppBrowserFaviconCapture(webContents, () => {
      faviconDisposals.delete(disposeFavicon)
    })
    faviconDisposals.add(disposeFavicon)
  }
  hostWebContents.on("did-attach-webview", faviconAttachListener)
  const disposeBoundary = wireInAppBrowserHostBoundary({
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
  })
  return () => {
    disposeBoundary()
    hostWebContents.removeListener("did-attach-webview", faviconAttachListener)
    for (const disposeFavicon of faviconDisposals) disposeFavicon()
  }
}
