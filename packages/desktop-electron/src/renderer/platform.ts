import { createBrowserPlatform, type Platform } from "@buddy/web/context/platform"
import { IN_APP_BROWSER_PARTITION, IN_APP_BROWSER_WEB_PREFERENCES } from "@buddy/browser-contract"
import { readBuddyRendererGlobals } from "../shared/parse-external"
import {
  checkForUpdate,
  getUpdateProgress,
  getUpdateRing,
  installPendingUpdate,
  onUpdateProgress,
  setUpdateRing,
} from "./updater"

type TStoreLike = {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  length(): Promise<number>
}

type TDesktopStateStorage = {
  getItem(name: string): string | null | Promise<string | null>
  setItem(name: string, value: string): Promise<void>
  removeItem(name: string): Promise<void>
  flush: () => Promise<void>
}

const WRITE_DEBOUNCE_MS = 250
const DEFAULT_STORE_NAME = "buddy.global.dat"

function normalizeDirectory(input: string) {
  const trimmed = input.trim().split("\\").join("/")
  if (!trimmed) return ""
  if (trimmed === "/") return trimmed
  return trimmed.replace(/\/+$/, "")
}

function normalizeAppVersion(value: string | undefined): string | undefined {
  if (value === undefined) return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readDesktopAppVersion(): string | undefined {
  const apiVersion = normalizeAppVersion(window.api.getAppVersion())
  if (apiVersion) return apiVersion
  return normalizeAppVersion(readBuddyRendererGlobals(window)?.version)
}

function normalizePickerResult(result: string | string[] | null): string | string[] | null {
  if (result === null) return null
  if (Array.isArray(result)) {
    return result.map((value) => normalizeDirectory(value))
  }
  return normalizeDirectory(result)
}

function detectOs() {
  const userAgent = navigator.userAgent
  if (userAgent.includes("Mac")) return "macos" as const
  if (userAgent.includes("Windows")) return "windows" as const
  if (userAgent.includes("Linux")) return "linux" as const
  return undefined
}

function createStore(name: string): TStoreLike {
  return {
    get: async (key: string) => {
      const value = await window.api.storeGet(name, key)
      if (value === null) return undefined
      return value
    },
    set: async (key: string, value: string) => {
      await window.api.storeSet(name, key, value)
    },
    delete: async (key: string) => {
      await window.api.storeDelete(name, key)
    },
    clear: async () => {
      await window.api.storeClear(name)
    },
    keys: async () => window.api.storeKeys(name),
    length: async () => window.api.storeLength(name),
  }
}

function createStorage(name: string) {
  const pending = new Map<string, string | null>()
  const store = createStore(name)
  let timer: ReturnType<typeof setTimeout> | undefined
  let flushing: Promise<void> | undefined

  const flush = async () => {
    if (flushing) return flushing

    flushing = (async () => {
      while (pending.size > 0) {
        const batch = Array.from(pending.entries())
        pending.clear()

        for (const [key, value] of batch) {
          if (value === null) {
            await store.delete(key).catch(() => undefined)
          } else {
            await store.set(key, value).catch(() => undefined)
          }
        }
      }
    })().finally(() => {
      flushing = undefined
    })

    return flushing
  }

  const schedule = () => {
    if (timer) return

    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, WRITE_DEBOUNCE_MS)
  }

  const storage: TDesktopStateStorage = {
    async getItem(key) {
      const next = pending.get(key)
      if (next !== undefined) return next

      const value = await store.get(key).catch(() => undefined)
      return value === undefined ? null : value
    },
    async setItem(key, value) {
      pending.set(key, value)
      schedule()
    },
    async removeItem(key) {
      pending.set(key, null)
      schedule()
    },
    flush,
  }

  return storage
}

export function createDesktopPlatform(): Platform {
  const os = detectOs()
  const apiCache = new Map<string, TDesktopStateStorage>()

  const flushAll = async () => {
    const apis = Array.from(apiCache.values())
    await Promise.all(apis.map((api) => api.flush().catch(() => undefined)))
  }

  if ("addEventListener" in globalThis) {
    window.addEventListener("pagehide", () => {
      void flushAll()
    })
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return
      void flushAll()
    })
  }

  return {
    ...createBrowserPlatform(),
    platform: "desktop",
    os,
    inAppBrowser: {
      partition: IN_APP_BROWSER_PARTITION,
      webPreferences: IN_APP_BROWSER_WEB_PREFERENCES,
      onMessage: window.api.onInAppBrowserMessage,
      onFavicon: window.api.onInAppBrowserFavicon,
    },
    get version() {
      return readDesktopAppVersion()
    },
    storage(name) {
      const storeName = name ?? DEFAULT_STORE_NAME
      const cached = apiCache.get(storeName)
      if (cached) return cached

      const next = createStorage(storeName)
      apiCache.set(storeName, next)
      return next
    },
    async restart() {
      await flushAll()
      await window.api.killBackendUtility().catch(() => undefined)
      window.api.relaunch()
    },
    checkUpdate() {
      return checkForUpdate()
    },
    getUpdateProgress() {
      return getUpdateProgress()
    },
    getUpdateRing() {
      return getUpdateRing()
    },
    onUpdateProgress(cb) {
      return onUpdateProgress(cb)
    },
    setUpdateRing(ring) {
      return setUpdateRing(ring)
    },
    async update() {
      await installPendingUpdate()
    },
    openLink(url: string) {
      window.api.openLink(url)
    },
    async notify(title, description, href) {
      const focused = await window.api.getWindowFocused().catch(() => document.hasFocus())
      if (focused) return

      window.api.showNotification(title, description, href)
    },
    parseMarkdown(markdown) {
      return window.api.parseMarkdownCommand(markdown)
    },
    async openDirectoryPickerDialog(opts) {
      const result = await window.api.openDirectoryPicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Open project",
      })

      return normalizePickerResult(result)
    },
    async openFilePickerDialog(opts) {
      const result = await window.api.openFilePicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Select file",
      })

      return normalizePickerResult(result)
    },
    async resolveDroppedFilePath(file) {
      const resolvedPath = window.api.getPathForFile(file)
      if (!resolvedPath) return null
      const normalizedPath = normalizeDirectory(resolvedPath)
      return normalizedPath || null
    },
    consumeDroppedFilePaths() {
      return window.api
        .consumeDroppedFilePaths()
        .map((path) => normalizeDirectory(path))
        .filter((path) => path.length > 0)
    },
    async openPath(path, app) {
      await window.api.openPath(path, app)
    },
    async revealPath(path) {
      await window.api.revealPath(path)
    },
    getFileIcon(path) {
      return window.api.getFileIcon(path)
    },
    exportMarkdownPdf(input) {
      return window.api.exportMarkdownPdf(input)
    },
    getIsFullscreen() {
      return window.api.getIsFullscreen()
    },
    captureBenchScreenshot(rectangle) {
      return window.api.captureBenchScreenshot(rectangle)
    },
  }
}
