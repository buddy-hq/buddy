import { Buffer } from "node:buffer"
import { BrowserWindow, session } from "electron"
import { shouldInjectBackendAuth } from "./backend-auth-policy"
import { createBackendAuthWindowRegistry } from "./backend-auth-window-registry"

type BackendAuthConfig = {
  origin: string
  headerValue: string
}

let registered = false
let currentConfig: BackendAuthConfig | null = null
const interfaceWindows = createBackendAuthWindowRegistry()

export function registerBackendAuthWindow(window: BrowserWindow) {
  interfaceWindows.register(window)
}

export function registerBackendRequestAuth() {
  if (registered) return
  registered = true

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const config = currentConfig
    const webContents = details.webContents
    const frame = details.frame
    if (
      !config ||
      !shouldInjectBackendAuth({
        requestUrl: details.url,
        isAppWindow:
          !!webContents &&
          !webContents.isDestroyed() &&
          webContents.getType() === "window" &&
          interfaceWindows.has(BrowserWindow.fromWebContents(webContents)),
        isMainFrame:
          !!webContents &&
          !webContents.isDestroyed() &&
          !!frame &&
          !frame.isDestroyed() &&
          frame === webContents.mainFrame,
        resourceType: details.resourceType,
        origin: config.origin,
        requestHeaders: details.requestHeaders,
      })
    ) {
      callback({ requestHeaders: details.requestHeaders })
      return
    }

    callback({
      requestHeaders: {
        ...details.requestHeaders,
        Authorization: config.headerValue,
      },
    })
  })
}

export function configureBackendRequestAuth(input: {
  url: string
  username: string | null
  password: string | null
}) {
  if (!input.username || !input.password) {
    currentConfig = null
    return
  }

  currentConfig = {
    origin: new URL(input.url).origin,
    headerValue: `Basic ${Buffer.from(`${input.username}:${input.password}`).toString("base64")}`,
  }
}
