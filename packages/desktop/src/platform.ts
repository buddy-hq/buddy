import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { open } from "@tauri-apps/plugin-dialog"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import { type as osType } from "@tauri-apps/plugin-os"
import { relaunch } from "@tauri-apps/plugin-process"
import { open as shellOpen } from "@tauri-apps/plugin-shell"
import { Store } from "@tauri-apps/plugin-store"
import { createBrowserPlatform, type Platform } from "@buddy/web/context/platform"

function normalizeDirectory(input: string) {
  const trimmed = input.trim().split("\\").join("/")
  if (!trimmed) return ""
  if (trimmed === "/") return trimmed
  return trimmed.replace(/\/+$/, "")
}

export function createDesktopPlatform(): Platform {
  const os = (() => {
    const type = osType()
    if (type === "macos" || type === "windows" || type === "linux") return type
    return undefined
  })()

  type StoreLike = {
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<boolean>
    save?(): Promise<void>
    clear?(): Promise<void>
    keys?(): Promise<string[]>
    length?(): Promise<number>
  }
  type DesktopStateStorage = {
    getItem(name: string): string | null | Promise<string | null>
    setItem(name: string, value: string): unknown | Promise<unknown>
    removeItem(name: string): unknown | Promise<unknown>
    flush: () => Promise<void>
  }

  const storeCache = new Map<string, Promise<StoreLike>>()
  const apiCache = new Map<string, DesktopStateStorage>()
  const memoryCache = new Map<string, StoreLike>()

  function createMemoryStore() {
    const data = new Map<string, string>()
    const store: StoreLike = {
      async get<T>(key: string) {
        return data.get(key) as T | undefined
      },
      async set(key: string, value: unknown) {
        data.set(key, String(value))
      },
      async delete(key: string) {
        return data.delete(key)
      },
      async clear() {
        data.clear()
      },
      async keys() {
        return Array.from(data.keys())
      },
      async length() {
        return data.size
      },
    }
    return store
  }

  function getStore(name = "buddy.global.dat") {
    const path = name.endsWith(".json") ? name : `${name}.json`
    const cached = storeCache.get(path)
    if (cached) return cached

    const next = Store.load(path).catch(() => {
      const cachedMemory = memoryCache.get(path)
      if (cachedMemory) return cachedMemory

      const memory = createMemoryStore()
      memoryCache.set(path, memory)
      return memory
    })
    storeCache.set(path, next)
    return next
  }

  function createStorage(name: string) {
    const pending = new Map<string, string | null>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let flushing: Promise<void> | undefined
    const WRITE_DEBOUNCE_MS = 250

    const flush = async () => {
      if (flushing) return flushing

      flushing = (async () => {
        const store = await getStore(name)

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

        await store.save?.().catch(() => undefined)
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

    return {
      async getItem(key: string) {
        const next = pending.get(key)
        if (next !== undefined) return next

        const store = await getStore(name)
        const value = await store.get<string>(key).catch(() => null)
        return typeof value === "string" ? value : null
      },
      async setItem(key: string, value: string) {
        pending.set(key, value)
        schedule()
      },
      async removeItem(key: string) {
        pending.set(key, null)
        schedule()
      },
      flush,
    } satisfies DesktopStateStorage
  }

  const flushAll = async () => {
    const apis = Array.from(apiCache.values())
    await Promise.all(apis.map((api) => api?.flush?.().catch(() => undefined)))
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
    storage(name) {
      const storeName = name ?? "buddy.global.dat"
      const cached = apiCache.get(storeName)
      if (cached) return cached

      const next = createStorage(storeName)
      apiCache.set(storeName, next)
      return next
    },
    fetch(input, init) {
      if (input instanceof Request) {
        return tauriFetch(input)
      }

      return tauriFetch(input, init)
    },
    async restart() {
      await flushAll()
      await relaunch()
    },
    openLink(url: string) {
      void shellOpen(url).catch(() => undefined)
    },
    async notify(title, description) {
      const granted = await isPermissionGranted().catch(() => false)
      const permission = granted ? "granted" : await requestPermission().catch(() => "denied")
      if (permission !== "granted") return

      const win = getCurrentWindow()
      const focused = await win.isFocused().catch(() => document.hasFocus())
      if (focused) return

      await Promise.resolve()
        .then(() => {
          if (!("Notification" in window)) return
          new Notification(title, description ? { body: description } : undefined)
        })
        .catch(() => undefined)
    },
    parseMarkdown(markdown) {
      return invoke<string>("parse_markdown_command", { markdown })
    },
    async openDirectoryPickerDialog(opts) {
      const result = await open({
        directory: true,
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Open project",
      }) as string | string[] | null

      if (typeof result === "string") {
        return normalizeDirectory(result)
      }

      if (Array.isArray(result)) {
        return result
          .filter((value): value is string => typeof value === "string")
          .map((value: string) => normalizeDirectory(value))
      }

      return null
    },
  }
}
