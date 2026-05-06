import windowState from "electron-window-state"
import { app, BrowserWindow, nativeImage, nativeTheme } from "electron"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { TitlebarTheme } from "../preload/types"

type WindowGlobals = {
  updaterEnabled: boolean
  deepLinks?: string[]
  version: string
  iconUrl?: string
}

const root = dirname(fileURLToPath(import.meta.url))

// Dark/light fallback colors used before the renderer can communicate the
// exact theme background. Chosen to match the dracula default dark theme and
// a neutral off-white for light mode so the native window never flashes pure
// white on a dark-theme setup.
const FALLBACK_DARK_BG = "#1d1e28"
const FALLBACK_LIGHT_BG = "#f4f3f0"

let backgroundColor: string | undefined

export function setBackgroundColor(color: string) {
  backgroundColor = color
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(color)
  }
}

export function getBackgroundColor() {
  return backgroundColor
}

function resolveBackgroundColor(): string {
  if (backgroundColor) return backgroundColor
  return nativeTheme.shouldUseDarkColors ? FALLBACK_DARK_BG : FALLBACK_LIGHT_BG
}

function resolveDevBranchName(): string | undefined {
  if (app.isPackaged) return undefined
  const fromEnv = process.env.BUDDY_DEV_INSTANCE_NAME?.trim()
  if (fromEnv) return fromEnv

  try {
    const result = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      cwd: join(root, "../../../.."),
    })
    const branch = result.trim()
    return branch.length > 0 ? branch : undefined
  } catch {
    return undefined
  }
}

function resolveWindowTitle(): string {
  const branch = resolveDevBranchName()
  if (branch && branch !== "main" && branch !== "master") {
    return `Buddy Dev — ${branch}`
  }
  return "Buddy"
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
    title: resolveWindowTitle(),
    icon: iconPath(),
    backgroundColor: resolveBackgroundColor(),
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
  lockWindowTitle(win)
  loadWindow(win, "index.html")
  wireZoom(win)
  injectGlobals(win, globals)
  setTitlebar(win)

  return win
}

export function createLoadingWindow(globals: WindowGlobals) {
  const title = resolveWindowTitle()
  const win = new BrowserWindow({
    title,
    width: 640,
    height: 480,
    resizable: false,
    center: true,
    show: true,
    icon: iconPath(),
    backgroundColor: resolveBackgroundColor(),
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

  lockWindowTitle(win)
  loadWindow(win, "loading.html")
  injectGlobals(win, globals)
  setTitlebar(win)

  return win
}

function lockWindowTitle(win: BrowserWindow) {
  const title = resolveWindowTitle()
  win.setTitle(title)
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault()
    win.setTitle(title)
  })
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
    const resolvedIconUrl = resolveWindowIconUrl(win)
    const payload = {
      updaterEnabled: globals.updaterEnabled,
      deepLinks: Array.isArray(deepLinks) ? [...deepLinks] : [],
      version: globals.version,
      assetBaseUrl,
      devInstanceName: resolveDevBranchName(),
      ...(globals.iconUrl || resolvedIconUrl
        ? { iconUrl: globals.iconUrl ?? resolvedIconUrl }
        : {}),
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

function resolveWindowIconUrl(win: BrowserWindow) {
  const currentUrl = win.webContents.getURL()

  try {
    const parsed = new URL(currentUrl)
    if (parsed.protocol !== "file:") {
      return undefined
    }
    return pathToFileURL(iconPath()).toString()
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
