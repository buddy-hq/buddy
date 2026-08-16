import { execFile } from "node:child_process"
import { app, BrowserWindow, Notification, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import { READER_EXTERNAL_LINK_PROTOCOLS, readAllowedExternalLink } from "@buddy/reader-contract"

import type {
  BenchCaptureRectangle,
  InitStep,
  LinuxDisplayBackend,
  MarkdownPdfExportInput,
  ServerReadyData,
  SqliteMigrationProgress,
  TitlebarTheme,
  WslConfig,
} from "../preload/types"
import type { UpdateProgressSnapshot, UpdateRing } from "../shared/update-state"
import { isValidBenchCaptureRectangle } from "./bench-capture"
import { parseTString } from "../shared/parse-external"
import { getStore } from "./store"
import { setTitlebar } from "./windows"

const pickerFilters = (extensions?: string[]) => {
  if (!extensions || extensions.length === 0) {
    return undefined
  }
  return [{ name: "Files", extensions }]
}

const FILE_ICON_SIZE = "normal" as const
const DESKTOP_EXTERNAL_LINK_PROTOCOLS = [...READER_EXTERNAL_LINK_PROTOCOLS, "obsidian:"] as const

type Deps = {
  killBackendUtility: () => Promise<void> | void
  installCli: () => Promise<string>
  awaitInitialization: (sendStep: (step: InitStep) => void) => Promise<ServerReadyData>
  getDefaultServerUrl: () => Promise<string | null> | string | null
  setDefaultServerUrl: (url: string | null) => Promise<void> | void
  getWslConfig: () => Promise<WslConfig>
  setWslConfig: (config: WslConfig) => Promise<void> | void
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void> | void
  parseMarkdown: (markdown: string) => Promise<string> | string
  checkAppExists: (appName: string) => Promise<boolean> | boolean
  wslPath: (path: string, mode: "windows" | "linux" | null) => Promise<string>
  resolveAppPath: (appName: string) => Promise<string | null>
  loadingWindowComplete: () => void
  runUpdater: (alertOnFail: boolean) => Promise<void> | void
  checkUpdate: () => Promise<{
    blocked?: boolean
    updateAvailable: boolean
    version?: string
    failed?: boolean
  }>
  getUpdateProgress: () => UpdateProgressSnapshot
  getUpdateRing: () => UpdateRing
  setUpdateRing: (ring: UpdateRing) => void
  installUpdate: () => Promise<void> | void
  setBackgroundColor: (color: string) => void
  exportMarkdownPdf: (input: MarkdownPdfExportInput) => Promise<string | null>
}

export function registerIpcHandlers(deps: Deps) {
  ipcMain.handle("kill-backend-utility", () => deps.killBackendUtility())
  ipcMain.handle("install-cli", () => deps.installCli())
  ipcMain.handle("await-initialization", (event: IpcMainInvokeEvent) => {
    const send = (step: InitStep) => event.sender.send("init-step", step)
    return deps.awaitInitialization(send)
  })
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl())
  ipcMain.handle("set-default-server-url", (_event: IpcMainInvokeEvent, url: string | null) =>
    deps.setDefaultServerUrl(url),
  )
  ipcMain.handle("get-wsl-config", () => deps.getWslConfig())
  ipcMain.handle("set-wsl-config", (_event: IpcMainInvokeEvent, config: WslConfig) =>
    deps.setWslConfig(config),
  )
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend())
  ipcMain.handle(
    "set-display-backend",
    (_event: IpcMainInvokeEvent, backend: LinuxDisplayBackend | null) =>
      deps.setDisplayBackend(backend),
  )
  ipcMain.handle("parse-markdown", (_event: IpcMainInvokeEvent, markdown: string) =>
    deps.parseMarkdown(markdown),
  )
  ipcMain.handle("check-app-exists", (_event: IpcMainInvokeEvent, appName: string) =>
    deps.checkAppExists(appName),
  )
  ipcMain.handle(
    "wsl-path",
    (_event: IpcMainInvokeEvent, path: string, mode: "windows" | "linux" | null) =>
      deps.wslPath(path, mode),
  )
  ipcMain.handle("resolve-app-path", (_event: IpcMainInvokeEvent, appName: string) =>
    deps.resolveAppPath(appName),
  )
  ipcMain.on("loading-window-complete", () => deps.loadingWindowComplete())
  ipcMain.handle("run-updater", (_event: IpcMainInvokeEvent, alertOnFail: boolean) =>
    deps.runUpdater(alertOnFail),
  )
  ipcMain.handle("check-update", () => deps.checkUpdate())
  ipcMain.handle("get-update-progress", () => deps.getUpdateProgress())
  ipcMain.handle("get-update-ring", () => deps.getUpdateRing())
  ipcMain.handle("set-update-ring", (_event: IpcMainInvokeEvent, ring: UpdateRing) =>
    deps.setUpdateRing(ring),
  )
  ipcMain.handle("install-update", () => deps.installUpdate())
  ipcMain.handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) =>
    deps.setBackgroundColor(color),
  )
  ipcMain.handle(
    "export-markdown-pdf",
    (_event: IpcMainInvokeEvent, input: MarkdownPdfExportInput) => deps.exportMarkdownPdf(input),
  )

  ipcMain.handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    const store = getStore(name)
    const value = store.get(key)
    const text = parseTString(value)
    if (text !== undefined) {
      return text
    }
    if (value === undefined || value === null) {
      return null
    }
    return JSON.stringify(value)
  })
  ipcMain.handle(
    "store-set",
    (_event: IpcMainInvokeEvent, name: string, key: string, value: string) => {
      getStore(name).set(key, value)
    },
  )
  ipcMain.handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    getStore(name).delete(key)
  })
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    getStore(name).clear()
  })
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store)
  })
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store).length
  })

  ipcMain.handle(
    "open-directory-picker",
    async (
      _event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: [
          "openDirectory",
          ...(opts?.multiple ? ["multiSelections" as const] : []),
          "createDirectory",
        ],
        title: opts?.title ?? "Choose a folder",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  ipcMain.handle(
    "open-file-picker",
    async (
      _event: IpcMainInvokeEvent,
      opts?: {
        multiple?: boolean
        title?: string
        defaultPath?: string
        accept?: string[]
        extensions?: string[]
      },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", ...(opts?.multiple ? ["multiSelections" as const] : [])],
        title: opts?.title ?? "Choose a file",
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  ipcMain.handle(
    "save-file-picker",
    async (_event: IpcMainInvokeEvent, opts?: { title?: string; defaultPath?: string }) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? "Save file",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return result.filePath ?? null
    },
  )

  ipcMain.on("open-link", (_event: IpcMainEvent, url: string) => {
    const parsedUrl = parseTString(url)
    if (parsedUrl === undefined) return
    const safeUrl = readAllowedExternalLink(parsedUrl, DESKTOP_EXTERNAL_LINK_PROTOCOLS)
    if (!safeUrl) return
    void shell.openExternal(safeUrl)
  })

  ipcMain.handle(
    "open-path",
    async (_event: IpcMainInvokeEvent, path: string, appPath?: string) => {
      if (!appPath) {
        const error = await shell.openPath(path)
        if (error) {
          throw new Error(error)
        }
        return
      }
      await new Promise<void>((resolve, reject) => {
        const [cmd, args] =
          process.platform === "darwin"
            ? (["open", ["-a", appPath, path]] as const)
            : ([appPath, [path]] as const)
        execFile(cmd, args, (err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      })
    },
  )

  ipcMain.handle("reveal-path", async (_event: IpcMainInvokeEvent, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle("get-file-icon", async (_event: IpcMainInvokeEvent, path: string) => {
    const image = await app.getFileIcon(path, { size: FILE_ICON_SIZE })
    if (image.isEmpty()) return null
    return image.toDataURL()
  })

  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) {
      return null
    }
    const buffer = image.toPNG().buffer
    const size = image.getSize()
    return { buffer, width: size.width, height: size.height }
  })

  ipcMain.handle(
    "capture-bench-screenshot",
    async (event: IpcMainInvokeEvent, rectangle: BenchCaptureRectangle) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) throw new Error("Bench capture window is unavailable.")
      const [width, height] = window.getContentSize()
      if (!isValidBenchCaptureRectangle(rectangle, { width, height })) {
        throw new Error("Bench capture rectangle is invalid.")
      }
      const image = await event.sender.capturePage(rectangle)
      if (image.isEmpty()) throw new Error("Bench capture returned an empty image.")
      return image.toPNG().toString("base64")
    },
  )

  ipcMain.on(
    "show-notification",
    (event: IpcMainEvent, title: string, body?: string, href?: string) => {
      const notification = new Notification({ title, body })
      notification.on("click", () => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.show()
        win?.focus()
        if (href) {
          event.sender.send("notification-click", href)
        }
      })
      notification.show()
    },
  )

  ipcMain.handle("get-window-count", () => BrowserWindow.getAllWindows().length)

  ipcMain.handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })
  ipcMain.handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.focus()
  })
  ipcMain.handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.show()
  })

  ipcMain.on("relaunch", () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle("get-zoom-factor", (event: IpcMainInvokeEvent) => event.sender.getZoomFactor())
  ipcMain.handle("set-zoom-factor", (event: IpcMainInvokeEvent, factor: number) =>
    event.sender.setZoomFactor(factor),
  )
  ipcMain.handle("set-titlebar", (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    setTitlebar(win, theme)
  })
  ipcMain.handle("get-is-fullscreen", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })
}

export function sendSqliteMigrationProgress(win: BrowserWindow, progress: SqliteMigrationProgress) {
  win.webContents.send("sqlite-migration-progress", progress)
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id)
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls)
}

export function sendFullscreenChanged(win: BrowserWindow, isFullscreen: boolean) {
  win.webContents.send("fullscreen-changed", isFullscreen)
}
