import type { IpcRendererEvent } from "electron"
import { contextBridge, ipcRenderer, webUtils } from "electron"
import { readBuddyWindowVersionArg } from "../shared/window-preload-args"
import {
  isFunctionValue,
  isObjectValue,
  parseTString,
} from "../shared/parse-external"
import type { ElectronAPI, InitStep, SqliteMigrationProgress } from "./types"

const appVersion = readBuddyWindowVersionArg(process.argv)

const DROPPED_FILE_PATH_CACHE_MAX_ENTRIES = 200
const droppedFilePathByFingerprint = new Map<string, string>()
let lastDroppedFilePaths: string[] = []

type TDropListenerEvent = {
  dataTransfer?: {
    files?: Iterable<File>
  }
}
type TEventTargetLike = {
  addEventListener: (
    type: string,
    listener: (event: TDropListenerEvent) => void,
    capture?: boolean,
  ) => void
}

function fileFingerprint(file: Pick<File, "name" | "size" | "lastModified" | "type">) {
  return `${file.name}\n${file.size}\n${file.lastModified}\n${file.type}`
}

function isIterable<TValue>(value: TValue): value is TValue & Iterable<File | TValue> {
  if (!isObjectValue(value)) return false
  if (!(Symbol.iterator in value)) return false
  return isFunctionValue(value[Symbol.iterator])
}

function isFile<TValue>(value: TValue): value is TValue & File {
  return value instanceof File
}

function getDroppedFilePaths<TValue>(event: TValue): string[] {
  if (!isObjectValue(event)) return []
  if (!("dataTransfer" in event)) return []
  const dataTransfer = event.dataTransfer
  if (!isObjectValue(dataTransfer)) return []
  if (!("files" in dataTransfer)) return []
  const files = dataTransfer.files
  if (!isIterable(files)) return []

  const nextDroppedFilePaths: string[] = []

  for (const fileCandidate of files) {
    if (!isFile(fileCandidate)) continue
    const file = fileCandidate
    const filepath = webUtils.getPathForFile(file)
    if (!filepath) continue
    nextDroppedFilePaths.push(filepath)

    const fingerprint = fileFingerprint(file)
    if (droppedFilePathByFingerprint.has(fingerprint)) {
      droppedFilePathByFingerprint.delete(fingerprint)
    }
    droppedFilePathByFingerprint.set(fingerprint, filepath)
  }

  while (droppedFilePathByFingerprint.size > DROPPED_FILE_PATH_CACHE_MAX_ENTRIES) {
    const oldestKey = parseTString(droppedFilePathByFingerprint.keys().next().value)
    if (oldestKey === undefined) {
      break
    }
    droppedFilePathByFingerprint.delete(oldestKey)
  }

  return nextDroppedFilePaths
}

function readAddEventListener<TValue>(
  source: TValue,
): TEventTargetLike["addEventListener"] | undefined {
  if (!isObjectValue(source)) return undefined
  if (!("addEventListener" in source)) return undefined

  let current: TValue | undefined = source
  while (current !== undefined && isObjectValue(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "addEventListener")
    if (descriptor !== undefined) {
      if (!isFunctionValue(descriptor.value)) return undefined
      return descriptor.value.bind(source)
    }
    const proto = Object.getPrototypeOf(current)
    current = isObjectValue(proto) ? proto : undefined
  }

  return undefined
}

function cacheDroppedFilePaths(event: TDropListenerEvent) {
  lastDroppedFilePaths = getDroppedFilePaths(event)
}

const addDropListener = readAddEventListener(globalThis)
if (addDropListener) {
  addDropListener("drop", cacheDroppedFilePaths, true)
}

const api: ElectronAPI = {
  killBackendUtility: () => ipcRenderer.invoke("kill-backend-utility"),
  installCli: () => ipcRenderer.invoke("install-cli"),
  awaitInitialization: (onStep) => {
    const handler = (_: IpcRendererEvent, step: InitStep) => onStep(step)
    ipcRenderer.on("init-step", handler)
    return ipcRenderer.invoke("await-initialization").finally(() => {
      ipcRenderer.removeListener("init-step", handler)
    })
  },
  getDefaultServerUrl: () => ipcRenderer.invoke("get-default-server-url"),
  setDefaultServerUrl: (url) => ipcRenderer.invoke("set-default-server-url", url),
  getWslConfig: () => ipcRenderer.invoke("get-wsl-config"),
  setWslConfig: (config) => ipcRenderer.invoke("set-wsl-config", config),
  getDisplayBackend: () => ipcRenderer.invoke("get-display-backend"),
  setDisplayBackend: (backend) => ipcRenderer.invoke("set-display-backend", backend),
  parseMarkdownCommand: (markdown) => ipcRenderer.invoke("parse-markdown", markdown),
  checkAppExists: (appName) => ipcRenderer.invoke("check-app-exists", appName),
  wslPath: (path, mode) => ipcRenderer.invoke("wsl-path", path, mode),
  resolveAppPath: (appName) => ipcRenderer.invoke("resolve-app-path", appName),
  storeGet: (name, key) => ipcRenderer.invoke("store-get", name, key),
  storeSet: (name, key, value) => ipcRenderer.invoke("store-set", name, key, value),
  storeDelete: (name, key) => ipcRenderer.invoke("store-delete", name, key),
  storeClear: (name) => ipcRenderer.invoke("store-clear", name),
  storeKeys: (name) => ipcRenderer.invoke("store-keys", name),
  storeLength: (name) => ipcRenderer.invoke("store-length", name),

  getWindowCount: () => ipcRenderer.invoke("get-window-count"),
  onSqliteMigrationProgress: (cb) => {
    const handler = (_: IpcRendererEvent, progress: SqliteMigrationProgress) => cb(progress)
    ipcRenderer.on("sqlite-migration-progress", handler)
    return () => ipcRenderer.removeListener("sqlite-migration-progress", handler)
  },
  onMenuCommand: (cb) => {
    const handler = (_: IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on("menu-command", handler)
    return () => ipcRenderer.removeListener("menu-command", handler)
  },
  onDeepLink: (cb) => {
    const handler = (_: IpcRendererEvent, urls: string[]) => cb(urls)
    ipcRenderer.on("deep-link", handler)
    return () => ipcRenderer.removeListener("deep-link", handler)
  },
  onFullscreenChanged: (cb) => {
    const handler = (_: IpcRendererEvent, isFullscreen: boolean) => cb(isFullscreen)
    ipcRenderer.on("fullscreen-changed", handler)
    return () => ipcRenderer.removeListener("fullscreen-changed", handler)
  },
  getIsFullscreen: () => ipcRenderer.invoke("get-is-fullscreen"),

  openDirectoryPicker: (opts) => ipcRenderer.invoke("open-directory-picker", opts),
  openFilePicker: (opts) => ipcRenderer.invoke("open-file-picker", opts),
  saveFilePicker: (opts) => ipcRenderer.invoke("save-file-picker", opts),
  exportMarkdownPdf: (input) => ipcRenderer.invoke("export-markdown-pdf", input),
  openLink: (url) => ipcRenderer.send("open-link", url),
  openPath: (path, app) => ipcRenderer.invoke("open-path", path, app),
  revealPath: (path) => ipcRenderer.invoke("reveal-path", path),
  getFileIcon: (path) => ipcRenderer.invoke("get-file-icon", path),
  readClipboardImage: () => ipcRenderer.invoke("read-clipboard-image"),
  showNotification: (title, body, href) => ipcRenderer.send("show-notification", title, body, href),
  onNotificationClick: (cb) => {
    const handler = (_: IpcRendererEvent, href: string) => cb(href)
    ipcRenderer.on("notification-click", handler)
    return () => ipcRenderer.removeListener("notification-click", handler)
  },
  getWindowFocused: () => ipcRenderer.invoke("get-window-focused"),
  setWindowFocus: () => ipcRenderer.invoke("set-window-focus"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  relaunch: () => ipcRenderer.send("relaunch"),
  getZoomFactor: () => ipcRenderer.invoke("get-zoom-factor"),
  setZoomFactor: (factor) => ipcRenderer.invoke("set-zoom-factor", factor),
  setTitlebar: (theme) => ipcRenderer.invoke("set-titlebar", theme),
  loadingWindowComplete: () => ipcRenderer.send("loading-window-complete"),
  getAppVersion: () => appVersion,
  runUpdater: (alertOnFail) => ipcRenderer.invoke("run-updater", alertOnFail),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  getUpdateProgress: () => ipcRenderer.invoke("get-update-progress"),
  getUpdateRing: () => ipcRenderer.invoke("get-update-ring"),
  onUpdateProgress: (cb) => {
    const handler = (_: IpcRendererEvent, snapshot: Parameters<typeof cb>[0]) => cb(snapshot)
    ipcRenderer.on("update-progress", handler)
    return () => ipcRenderer.removeListener("update-progress", handler)
  },
  setUpdateRing: (ring) => ipcRenderer.invoke("set-update-ring", ring),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  setBackgroundColor: (color) => ipcRenderer.invoke("set-background-color", color),
  getPathForFile: (file) => {
    try {
      const directPath = webUtils.getPathForFile(file)
      if (directPath) return directPath
    } catch {
      // Falls back to metadata lookup below.
    }

    const fingerprint = fileFingerprint(file)
    return droppedFilePathByFingerprint.get(fingerprint) ?? ""
  },
  consumeDroppedFilePaths: () => {
    const paths = lastDroppedFilePaths
    lastDroppedFilePaths = []
    return paths
  },
  captureBenchScreenshot: (rectangle) => ipcRenderer.invoke("capture-bench-screenshot", rectangle),
}

contextBridge.exposeInMainWorld("api", api)
