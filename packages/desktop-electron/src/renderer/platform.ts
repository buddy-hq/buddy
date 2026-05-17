import { createBrowserPlatform, type Platform } from "@buddy/web/context/platform"
import { checkForUpdate, installPendingUpdate } from "./updater"

type BuddyWindow = Window & {
  __BUDDY__?: {
    version?: string
  }
}

type StoreLike = {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  length(): Promise<number>
}

type DesktopStateStorage = {
  getItem(name: string): string | null | Promise<string | null>
  setItem(name: string, value: string): unknown | Promise<unknown>
  removeItem(name: string): unknown | Promise<unknown>
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

function detectOs() {
  const userAgent = navigator.userAgent
  if (userAgent.includes("Mac")) return "macos" as const
  if (userAgent.includes("Windows")) return "windows" as const
  if (userAgent.includes("Linux")) return "linux" as const
  return undefined
}

function createStore(name: string): StoreLike {
  return {
    get: async <T>(key: string) => {
      const value = await window.api.storeGet(name, key)
      if (value === null) return undefined
      return value as T
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

  const storage: DesktopStateStorage = {
    async getItem(key) {
      const next = pending.get(key)
      if (next !== undefined) return next

      const value = await store.get<string>(key).catch(() => null)
      return typeof value === "string" ? value : null
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
  const apiCache = new Map<string, DesktopStateStorage>()

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
    version: (window as BuddyWindow).__BUDDY__?.version,
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
      await window.api.killSidecar().catch(() => undefined)
      window.api.relaunch()
    },
    checkUpdate() {
      return checkForUpdate()
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

      if (typeof result === "string") {
        return normalizeDirectory(result)
      }

      if (Array.isArray(result)) {
        return result
          .filter((value): value is string => typeof value === "string")
          .map((value) => normalizeDirectory(value))
      }

      return null
    },
    async openFilePickerDialog(opts) {
      const result = await window.api.openFilePicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Select file",
      })

      if (typeof result === "string") {
        return normalizeDirectory(result)
      }

      if (Array.isArray(result)) {
        return result
          .filter((value): value is string => typeof value === "string")
          .map((value) => normalizeDirectory(value))
      }

      return null
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
  }
}
