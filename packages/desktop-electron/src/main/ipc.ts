import { execFile } from "node:child_process"
import { realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, Notification, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron"
import type {
  InAppBrowserAppearanceRequest,
  InAppBrowserCitationCaptureRequest,
  InAppBrowserCitationCaptureResult,
  InAppBrowserCitationLocateResult,
  InAppBrowserCitationMarkRequest,
  InAppBrowserCitationRevealRequest,
  InAppBrowserCitationUnmarkRequest,
  InAppBrowserClearProfileDataRequest,
  InAppBrowserCommandResult,
} from "@buddy/browser-contract"
import type {
  BrowserImportRequest,
  BrowserImportResult,
  BrowserImportSource,
} from "@buddy/browser-contract/browser-import"

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
import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import { normalizeUpdateRing } from "@buddy/update-contract"
import { isValidBenchCaptureRectangle } from "./bench-capture"
import { openDesktopExternalLink } from "./external-links"
import { parseTString } from "../shared/parse-external"
import { getStore } from "./store"
import {
  deleteRendererStoreValue,
  listRendererStoreKeys,
  parseRendererStoreRecord,
  readRendererStoreValue,
  setRendererStoreValue,
} from "./renderer-store-record"
import { setTitlebar } from "./windows"

const pickerFilters = (extensions?: string[]) => {
  if (!extensions || extensions.length === 0) {
    return undefined
  }
  return [{ name: "Files", extensions }]
}

const FILE_ICON_SIZE = "normal" as const

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
  getUpdateState: () => UpdateState
  checkUpdate: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<UpdateState>
  setUpdateRing: (ring: UpdateRing) => Promise<UpdateState>
  setBackgroundColor: (color: string) => void
  exportMarkdownPdf: (input: MarkdownPdfExportInput) => Promise<string | null>
  setInAppBrowserAppearance: (
    host: WebContents,
    input: InAppBrowserAppearanceRequest,
  ) => Promise<InAppBrowserCommandResult>
  clearInAppBrowserProfileData: (
    input: InAppBrowserClearProfileDataRequest,
  ) => Promise<InAppBrowserCommandResult>
  captureInAppBrowserCitation: (
    host: WebContents,
    input: InAppBrowserCitationCaptureRequest,
  ) => Promise<InAppBrowserCitationCaptureResult>
  markInAppBrowserCitation: (
    host: WebContents,
    input: InAppBrowserCitationMarkRequest,
  ) => Promise<InAppBrowserCitationLocateResult>
  unmarkInAppBrowserCitation: (
    host: WebContents,
    input: InAppBrowserCitationUnmarkRequest,
  ) => Promise<InAppBrowserCommandResult>
  revealInAppBrowserCitation: (
    host: WebContents,
    input: InAppBrowserCitationRevealRequest,
  ) => Promise<InAppBrowserCitationLocateResult>
  checkInAppBrowserSafariFullDiskAccess: () => Promise<boolean>
  listInAppBrowserImportSources: () => Promise<readonly BrowserImportSource[]>
  importInAppBrowserCookies: (input: BrowserImportRequest) => Promise<BrowserImportResult>
  openFullDiskAccessSettings: () => Promise<void>
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
  ipcMain.handle("update-get-state", () => deps.getUpdateState())
  ipcMain.handle("update-check", () => deps.checkUpdate())
  ipcMain.handle("update-download", () => deps.downloadUpdate())
  ipcMain.handle("update-install", () => deps.installUpdate())
  ipcMain.handle("update-set-ring", (_event: IpcMainInvokeEvent, ring: UpdateRing) =>
    deps.setUpdateRing(normalizeUpdateRing(ring)),
  )
  ipcMain.handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) =>
    deps.setBackgroundColor(color),
  )
  ipcMain.handle(
    "export-markdown-pdf",
    (_event: IpcMainInvokeEvent, input: MarkdownPdfExportInput) => deps.exportMarkdownPdf(input),
  )
  ipcMain.handle(
    "in-app-browser-set-appearance",
    (event: IpcMainInvokeEvent, input: InAppBrowserAppearanceRequest) =>
      deps.setInAppBrowserAppearance(event.sender, input),
  )
  ipcMain.handle(
    "in-app-browser-clear-profile-data",
    (_event: IpcMainInvokeEvent, input: InAppBrowserClearProfileDataRequest) =>
      deps.clearInAppBrowserProfileData(input),
  )
  ipcMain.handle(
    "in-app-browser-capture-citation",
    (event: IpcMainInvokeEvent, input: InAppBrowserCitationCaptureRequest) =>
      deps.captureInAppBrowserCitation(event.sender, input),
  )
  ipcMain.handle(
    "in-app-browser-mark-citation",
    (event: IpcMainInvokeEvent, input: InAppBrowserCitationMarkRequest) =>
      deps.markInAppBrowserCitation(event.sender, input),
  )
  ipcMain.handle(
    "in-app-browser-unmark-citation",
    (event: IpcMainInvokeEvent, input: InAppBrowserCitationUnmarkRequest) =>
      deps.unmarkInAppBrowserCitation(event.sender, input),
  )
  ipcMain.handle(
    "in-app-browser-reveal-citation",
    (event: IpcMainInvokeEvent, input: InAppBrowserCitationRevealRequest) =>
      deps.revealInAppBrowserCitation(event.sender, input),
  )
  ipcMain.handle("in-app-browser-check-safari-full-disk-access", () =>
    deps.checkInAppBrowserSafariFullDiskAccess(),
  )
  ipcMain.handle("in-app-browser-list-import-sources", () => deps.listInAppBrowserImportSources())
  ipcMain.handle(
    "in-app-browser-import-cookies",
    (_event: IpcMainInvokeEvent, input: BrowserImportRequest) =>
      deps.importInAppBrowserCookies(input),
  )
  ipcMain.handle("open-full-disk-access-settings", () => deps.openFullDiskAccessSettings())

  ipcMain.handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    const store = getStore(name)
    const value = readRendererStoreValue(parseRendererStoreRecord(store.store), key)
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
      const store = getStore(name)
      store.store = setRendererStoreValue(
        parseRendererStoreRecord(store.store),
        key,
        value,
      ).valuesByKey
    },
  )
  ipcMain.handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    const store = getStore(name)
    store.store = deleteRendererStoreValue(parseRendererStoreRecord(store.store), key).valuesByKey
  })
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    getStore(name).clear()
  })
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return listRendererStoreKeys(parseRendererStoreRecord(store.store))
  })
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return listRendererStoreKeys(parseRendererStoreRecord(store.store)).length
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
    openDesktopExternalLink(url, (safeUrl) => shell.openExternal(safeUrl))
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

  ipcMain.handle(
    "reveal-containing-folder",
    async (_event: IpcMainInvokeEvent, directory: string, inputPath: string) => {
      const sourcePath = inputPath.trim()
      if (!sourcePath) throw new Error("File path is empty")
      if (
        process.platform === "win32"
          ? (sourcePath.startsWith("/") && !sourcePath.startsWith("//")) ||
            /^[A-Za-z]:(?![\\/])/u.test(sourcePath)
          : /^[A-Za-z]:/u.test(sourcePath) ||
            sourcePath.includes("\\") ||
            sourcePath.startsWith("//") ||
            /^file:\/\/(?:localhost)?\/[A-Za-z]:\//iu.test(sourcePath)
      ) {
        throw new Error("This file path belongs to another operating system")
      }
      const absolutePath = sourcePath.startsWith("file://")
        ? fileURLToPath(sourcePath)
        : sourcePath.startsWith("~/") || sourcePath.startsWith("~\\")
          ? join(homedir(), sourcePath.slice(2))
          : isAbsolute(sourcePath) && !(process.platform === "win32" && /^\\(?!\\)/u.test(sourcePath))
            ? sourcePath
            : resolve(directory, sourcePath)
      if (
        process.platform === "win32" &&
        !/^[A-Za-z]:[\\/]/u.test(absolutePath) &&
        !absolutePath.startsWith("\\\\")
      ) {
        throw new Error("This file path belongs to another operating system")
      }
      const parentPath = await realpath(dirname(absolutePath))
      if (!(await stat(parentPath)).isDirectory()) {
        throw new Error("Containing folder is unavailable")
      }
      if (process.platform === "darwin" && parentPath.toLowerCase().endsWith(".app")) {
        throw new Error("Containing folder is an application bundle")
      }
      if (process.platform === "win32") {
        const error = await shell.openPath(parentPath)
        if (error) throw new Error(error)
        return
      }
      const command =
        process.platform === "darwin"
          ? (["open", ["-a", "Finder", parentPath]] as const)
          : (["xdg-open", [parentPath]] as const)
      await new Promise<void>((resolveOpen, rejectOpen) => {
        execFile(command[0], [...command[1]], (error) => {
          if (error) rejectOpen(error)
          else resolveOpen()
        })
      })
    },
  )

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
