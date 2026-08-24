import type { UpdateProgressSnapshot, UpdateRing } from "../shared/update-state"
import type {
  InAppBrowserFaviconMessage,
  InAppBrowserHostMessage,
} from "@buddy/browser-contract"

export type InitStep = { phase: "server_waiting" } | { phase: "sqlite_waiting" } | { phase: "done" }

export type ServerReadyData = {
  isEmbeddedBackend: boolean
  url: string
  username: string | null
  password: string | null
}

export type SqliteMigrationProgress = { type: "InProgress"; value: number } | { type: "Done" }

export type WslConfig = {
  enabled: boolean
}

export type LinuxDisplayBackend = "wayland" | "auto"

export type TitlebarTheme = {
  mode: "light" | "dark"
}

export type BenchCaptureRectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type ElectronAPI = {
  killBackendUtility: () => Promise<void>
  installCli: () => Promise<string>
  awaitInitialization: (onStep: (step: InitStep) => void) => Promise<ServerReadyData>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  getWslConfig: () => Promise<WslConfig>
  setWslConfig: (config: WslConfig) => Promise<void>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  parseMarkdownCommand: (markdown: string) => Promise<string>
  checkAppExists: (appName: string) => Promise<boolean>
  wslPath: (path: string, mode: "windows" | "linux" | null) => Promise<string>
  resolveAppPath: (appName: string) => Promise<string | null>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>

  getWindowCount: () => Promise<number>
  onSqliteMigrationProgress: (cb: (progress: SqliteMigrationProgress) => void) => () => void
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void
  onFullscreenChanged: (cb: (isFullscreen: boolean) => void) => () => void
  onInAppBrowserMessage: (cb: (message: InAppBrowserHostMessage) => void) => () => void
  onInAppBrowserFavicon: (cb: (message: InAppBrowserFaviconMessage) => void) => () => void
  getIsFullscreen: () => Promise<boolean>

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    accept?: string[]
    extensions?: string[]
  }) => Promise<string | string[] | null>
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  exportMarkdownPdf: (input: MarkdownPdfExportInput) => Promise<string | null>
  openLink: (url: string) => void
  openPath: (path: string, app?: string) => Promise<void>
  revealPath: (path: string) => Promise<void>
  getFileIcon: (path: string) => Promise<string | null>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  showNotification: (title: string, body?: string, href?: string) => void
  onNotificationClick: (cb: (href: string) => void) => () => void
  getWindowFocused: () => Promise<boolean>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  loadingWindowComplete: () => void
  getAppVersion: () => string | undefined
  runUpdater: (alertOnFail: boolean) => Promise<void>
  checkUpdate: () => Promise<{
    blocked?: boolean
    updateAvailable: boolean
    version?: string
    failed?: boolean
  }>
  getUpdateProgress: () => Promise<UpdateProgressSnapshot>
  getUpdateRing: () => Promise<UpdateRing>
  onUpdateProgress: (cb: (snapshot: UpdateProgressSnapshot) => void) => () => void
  setUpdateRing: (ring: UpdateRing) => Promise<void>
  installUpdate: () => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  getPathForFile: (file: File) => string
  consumeDroppedFilePaths: () => string[]
  captureBenchScreenshot: (rectangle: BenchCaptureRectangle) => Promise<string>
}
export type MarkdownPdfExportInput = {
  html: string
  directory: string
  defaultPath: string
}
