import windowState from "electron-window-state"
import { app, BrowserWindow, nativeImage, nativeTheme } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { TitlebarTheme } from "../preload/types"

type WindowGlobals = {
  updaterEnabled: boolean
  deepLinks?: string[]
  version: string
}

const root = dirname(fileURLToPath(import.meta.url))

let backgroundColor: string | undefined

export function setBackgroundColor(color: string) {
  backgroundColor = color
}

export function getBackgroundColor() {
  return backgroundColor
}

function iconsDirectory() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "icons")
  }
  return join(root, "../../resources/icons")
}

function iconPath() {
  const extension = process.platform === "win32" ? "ico" : "png"
  return join(iconsDirectory(), `icon.${extension}`)
}

function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

function titlebarOverlay(theme: Partial<TitlebarTheme> = {}) {
  const mode = theme.mode ?? tone()
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: 40,
  }
}

export function setTitlebar(win: BrowserWindow, theme: Partial<TitlebarTheme> = {}) {
  if (process.platform !== "win32") return
  win.setTitleBarOverlay(titlebarOverlay(theme))
}

export function setDockIcon() {
  if (process.platform !== "darwin") return
  const icon = nativeImage.createFromPath(join(iconsDirectory(), "dock.png"))
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon)
  }
}

export function createMainWindow(globals: WindowGlobals) {
  const state = windowState({
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: true,
    title: "Buddy",
    icon: iconPath(),
    backgroundColor,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 12, y: 14 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: titlebarOverlay(),
        }
      : {}),
    webPreferences: {
      preload: join(root, "../preload/index.mjs"),
      sandbox: false,
    },
  })

  state.manage(win)
  loadWindow(win, "index.html")
  wireZoom(win)
  injectGlobals(win, globals)
  setTitlebar(win)

  return win
}

export function createLoadingWindow(globals: WindowGlobals) {
  const win = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    center: true,
    show: true,
    icon: iconPath(),
    backgroundColor,
    ...(process.platform === "darwin" ? { titleBarStyle: "hidden" as const } : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: titlebarOverlay(),
        }
      : {}),
    webPreferences: {
      preload: join(root, "../preload/index.mjs"),
      sandbox: false,
    },
  })

  loadWindow(win, "loading.html")
  injectGlobals(win, globals)
  setTitlebar(win)

  return win
}

function loadWindow(win: BrowserWindow, htmlFile: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(htmlFile, devUrl)
    void win.loadURL(url.toString())
    return
  }

  void win.loadFile(join(root, `../renderer/${htmlFile}`))
}

function injectGlobals(win: BrowserWindow, globals: WindowGlobals) {
  win.webContents.on("dom-ready", () => {
    const deepLinks = globals.deepLinks ?? []
    const assetBaseUrl = resolveAssetBaseUrl(win)
    const payload = {
      updaterEnabled: globals.updaterEnabled,
      deepLinks: Array.isArray(deepLinks) ? [...deepLinks] : [],
      version: globals.version,
      assetBaseUrl,
    }

    void win.webContents.executeJavaScript(
      `window.__BUDDY__ = Object.assign(window.__BUDDY__ ?? {}, ${JSON.stringify(payload)})`,
    )
  })
}

function resolveAssetBaseUrl(win: BrowserWindow) {
  const currentUrl = win.webContents.getURL()

  try {
    const parsed = new URL(currentUrl)
    if (parsed.protocol === "file:") {
      return new URL("./", parsed).toString()
    }
    return new URL("/", parsed).toString()
  } catch {
    return undefined
  }
}

function wireZoom(win: BrowserWindow) {
  win.webContents.setZoomFactor(1)
  win.webContents.on("zoom-changed", () => {
    win.webContents.setZoomFactor(1)
  })
}
