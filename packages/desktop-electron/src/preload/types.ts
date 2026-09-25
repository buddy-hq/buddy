import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import type {
  InAppBrowserAppearanceRequest,
  InAppBrowserAudioMessage,
  InAppBrowserCitationCaptureRequest,
  InAppBrowserCitationCaptureResult,
  InAppBrowserCitationLocateResult,
  InAppBrowserCitationMarkRequest,
  InAppBrowserCitationMessage,
  InAppBrowserCitationRevealRequest,
  InAppBrowserCitationUnmarkRequest,
  InAppBrowserClearProfileDataRequest,
  InAppBrowserCommandResult,
  InAppBrowserFaviconMessage,
  InAppBrowserHostMessage,
  InAppBrowserNewTabMessage,
  InAppBrowserShortcutMessage,
} from "@buddy/browser-contract"
import type {
  BrowserImportRequest,
  BrowserImportResult,
  BrowserImportSource,
} from "@buddy/browser-contract/browser-import"

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
  onInAppBrowserAudio: (cb: (message: InAppBrowserAudioMessage) => void) => () => void
  onInAppBrowserShortcut: (cb: (message: InAppBrowserShortcutMessage) => void) => () => void
  onInAppBrowserNewTab: (cb: (message: InAppBrowserNewTabMessage) => void) => () => void
  onInAppBrowserCitation: (cb: (message: InAppBrowserCitationMessage) => void) => () => void
  captureInAppBrowserCitation: (
    input: InAppBrowserCitationCaptureRequest,
  ) => Promise<InAppBrowserCitationCaptureResult>
  markInAppBrowserCitation: (
    input: InAppBrowserCitationMarkRequest,
  ) => Promise<InAppBrowserCitationLocateResult>
  unmarkInAppBrowserCitation: (
    input: InAppBrowserCitationUnmarkRequest,
  ) => Promise<InAppBrowserCommandResult>
  revealInAppBrowserCitation: (
    input: InAppBrowserCitationRevealRequest,
  ) => Promise<InAppBrowserCitationLocateResult>
  setInAppBrowserAppearance: (
    input: InAppBrowserAppearanceRequest,
  ) => Promise<InAppBrowserCommandResult>
  clearInAppBrowserProfileData: (
    input: InAppBrowserClearProfileDataRequest,
  ) => Promise<InAppBrowserCommandResult>
  checkInAppBrowserSafariFullDiskAccess: () => Promise<boolean>
  listInAppBrowserImportSources: () => Promise<readonly BrowserImportSource[]>
  importInAppBrowserCookies: (input: BrowserImportRequest) => Promise<BrowserImportResult>
  openFullDiskAccessSettings: () => Promise<void>
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
  revealContainingFolder: (directory: string, path: string) => Promise<void>
  trashNoteFile: (path: string) => Promise<void>
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
  getUpdateState: () => Promise<UpdateState>
  onUpdateState: (cb: (state: UpdateState) => void) => () => void
  checkUpdate: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<UpdateState>
  setUpdateRing: (ring: UpdateRing) => Promise<UpdateState>
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
