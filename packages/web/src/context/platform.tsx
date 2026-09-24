import { createContext, useContext, type ReactNode } from "react"
import { createJSONStorage, type StateStorage } from "zustand/middleware"
import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import { browserLocalStorage } from "@/state/parse-external"
import type {
  InAppBrowserAppearance,
  InAppBrowserAudioMessage,
  InAppBrowserCitationCaptureRequest,
  InAppBrowserCitationCaptureResult,
  InAppBrowserCitationLocateResult,
  InAppBrowserCitationMarkRequest,
  InAppBrowserCitationMessage,
  InAppBrowserCitationRevealRequest,
  InAppBrowserCitationUnmarkRequest,
  InAppBrowserCommandResult,
  InAppBrowserFaviconMessage,
  InAppBrowserHostMessage,
  InAppBrowserProfileData,
  InAppBrowserShortcutMessage,
} from "@buddy/browser-contract"
import type {
  BrowserImportRequest,
  BrowserImportResult,
  BrowserImportSource,
} from "@buddy/browser-contract/browser-import"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"

export type OpenDirectoryPickerOptions = {
  title?: string
  multiple?: boolean
}

export type OpenFilePickerOptions = {
  title?: string
  multiple?: boolean
}

export type MarkdownPdfExportInput = {
  html: string
  directory: string
  defaultPath: string
}

export type BenchCaptureRectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type PlatformStateStorage = StateStorage & {
  keys?(): readonly string[] | Promise<readonly string[]>
  /** Flushes buffered writes when the platform storage supports explicit durability. */
  flush?(): void | Promise<void>
}

export type Platform = {
  platform: "web" | "desktop"
  os?: "macos" | "windows" | "linux"
  version?: string
  startWindowDragging?(): Promise<void>
  toggleWindowMaximize?(): Promise<void>
  getIsFullscreen?(): Promise<boolean>
  storage?(name?: string): PlatformStateStorage
  openDirectoryPickerDialog?(opts?: OpenDirectoryPickerOptions): Promise<string | string[] | null>
  openFilePickerDialog?(opts?: OpenFilePickerOptions): Promise<string | string[] | null>
  resolveDroppedFilePath?(file: File): Promise<string | null> | string | null
  consumeDroppedFilePaths?(): Promise<string[]> | string[]
  openPath?(path: string, app?: string): Promise<void>
  revealPath?(path: string): Promise<void>
  revealContainingFolder?(directory: string, path: string): Promise<void>
  getFileIcon?(path: string): Promise<string | null>
  exportMarkdownPdf?(input: MarkdownPdfExportInput): Promise<string | null>
  fetch?: typeof fetch
  openLink(url: string): void
  restart(): Promise<void>
  back(): void
  forward(): void
  notify(title: string, description?: string, href?: string): Promise<void>
  getUpdateState?(): Promise<UpdateState>
  onUpdateState?(cb: (state: UpdateState) => void): () => void
  checkUpdate?(): Promise<UpdateState>
  downloadUpdate?(): Promise<UpdateState>
  installUpdate?(): Promise<UpdateState>
  setUpdateRing?(ring: UpdateRing): Promise<UpdateState>
  parseMarkdown?(markdown: string): Promise<string>
  captureBenchScreenshot?(rectangle: BenchCaptureRectangle): Promise<string>
  inAppBrowser?: InAppBrowserPlatform
}

export type InAppBrowserPlatform = {
  /** Legacy single-partition field retained while the Bench surface rolls forward. */
  partition?: string
  webPreferences: string
  onMessage(cb: (message: InAppBrowserHostMessage) => void): () => void
  onFavicon(cb: (message: InAppBrowserFaviconMessage) => void): () => void
  onAudio(cb: (message: InAppBrowserAudioMessage) => void): () => void
  onShortcut(cb: (message: InAppBrowserShortcutMessage) => void): () => void
  onCitation(cb: (message: InAppBrowserCitationMessage) => void): () => void
  captureCitation(
    input: InAppBrowserCitationCaptureRequest,
  ): Promise<InAppBrowserCitationCaptureResult>
  markCitation(input: InAppBrowserCitationMarkRequest): Promise<InAppBrowserCitationLocateResult>
  unmarkCitation(input: InAppBrowserCitationUnmarkRequest): Promise<InAppBrowserCommandResult>
  revealCitation(
    input: InAppBrowserCitationRevealRequest,
  ): Promise<InAppBrowserCitationLocateResult>
  setAppearance(input: {
    webContentsID: number
    appearance: InAppBrowserAppearance
  }): Promise<InAppBrowserCommandResult>
  clearProfileData(input: {
    profileID: InAppBrowserProfileID
    data: InAppBrowserProfileData
  }): Promise<InAppBrowserCommandResult>
  checkSafariFullDiskAccess(): Promise<boolean>
  listImportSources(): Promise<readonly BrowserImportSource[]>
  importCookies(input: BrowserImportRequest): Promise<BrowserImportResult>
  openFullDiskAccessSettings(): Promise<void>
}

function notifyWindowOfClick(href: string) {
  window.focus()

  if (/^(\/|\.\/|\.\.\/|\?|#)/u.test(href)) {
    window.dispatchEvent(new CustomEvent("buddy:notification-click", { detail: { href } }))
    return
  }

  try {
    const url = new URL(href)
    const currentUrl = new URL(window.location.href)
    if (url.origin === currentUrl.origin) {
      window.dispatchEvent(new CustomEvent("buddy:notification-click", { detail: { href } }))
      return
    }
  } catch {
    // Fall back to location.assign below.
  }

  window.location.assign(href)
}

const defaultPlatform: Platform = {
  platform: "web",
  openLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer")
  },
  async restart() {
    window.location.reload()
  },
  back() {
    window.history.back()
  },
  forward() {
    window.history.forward()
  },
  async notify(title: string, description?: string, href?: string) {
    if (!("Notification" in window)) return
    const options = description ? { body: description } : undefined
    if (Notification.permission === "granted") {
      const notification = new Notification(title, options)
      if (href) {
        notification.addEventListener("click", () => {
          notifyWindowOfClick(href)
        })
      }
      return
    }
    if (Notification.permission !== "denied") {
      const next = await Notification.requestPermission()
      if (next === "granted") {
        const notification = new Notification(title, options)
        if (href) {
          notification.addEventListener("click", () => {
            notifyWindowOfClick(href)
          })
        }
      }
    }
  },
}

let currentPlatform = defaultPlatform

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const PlatformContext = createContext<Platform>(defaultPlatform)

export function PlatformProvider(props: { value: Platform; children: ReactNode }) {
  currentPlatform = props.value

  return <PlatformContext.Provider value={props.value}>{props.children}</PlatformContext.Provider>
}

export function usePlatform() {
  return useContext(PlatformContext)
}

export function getPlatform() {
  return currentPlatform
}

export function setRuntimePlatform(platform: Platform) {
  currentPlatform = platform
}

export function createPlatformJsonStorage<S>(name?: string) {
  return createJSONStorage<S>(() => {
    const storage = currentPlatform.storage?.(name)
    if (storage) return storage
    return browserLocalStorage() ?? memoryStorage
  })
}

export function createBrowserPlatform(): Platform {
  return defaultPlatform
}
