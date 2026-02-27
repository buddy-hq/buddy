import { createContext, useContext, type ReactNode } from "react"
import { createJSONStorage, type StateStorage } from "zustand/middleware"

export type OpenDirectoryPickerOptions = {
  title?: string
  multiple?: boolean
}

export type Platform = {
  platform: "web" | "desktop"
  os?: "macos" | "windows" | "linux"
  storage?(name?: string): StateStorage
  openDirectoryPickerDialog?(opts?: OpenDirectoryPickerOptions): Promise<string | string[] | null>
  fetch?: typeof fetch
  openLink(url: string): void
  restart(): Promise<void>
  back(): void
  forward(): void
  notify(title: string, description?: string): Promise<void>
  parseMarkdown?(markdown: string): Promise<string>
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
  async notify(title: string, description?: string) {
    if (!("Notification" in window)) return
    if (Notification.permission === "granted") {
      new Notification(title, description ? { body: description } : undefined)
      return
    }
    if (Notification.permission !== "denied") {
      const next = await Notification.requestPermission()
      if (next === "granted") {
        new Notification(title, description ? { body: description } : undefined)
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

export function PlatformProvider(props: {
  value: Platform
  children: ReactNode
}) {
  currentPlatform = props.value

  return (
    <PlatformContext.Provider value={props.value}>
      {props.children}
    </PlatformContext.Provider>
  )
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
    if (typeof localStorage !== "undefined") return localStorage
    return memoryStorage
  })
}

export function createBrowserPlatform(): Platform {
  return defaultPlatform
}
