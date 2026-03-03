import { getPlatform } from "../context/platform"

export function normalizeDirectory(input: string) {
  const trimmed = input.trim().split("\\").join("/")
  if (!trimmed) return ""
  if (trimmed === "/") return trimmed
  return trimmed.replace(/\/+$/, "")
}

export function hasAbsolutePath(input: string) {
  return input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input)
}

declare global {
  interface Window {
    __TAURI__?: {
      dialog?: {
        open?: (options: {
          directory?: boolean
          multiple?: boolean
          title?: string
        }) => Promise<string | string[] | null>
      }
    }
    electronAPI?: {
      openDirectoryPickerDialog?: () => Promise<string | string[] | null>
    }
  }
}

async function openDesktopDirectoryPicker() {
  const platform = getPlatform()

  if (typeof platform.openDirectoryPickerDialog === "function") {
    try {
      const platformResult = await platform.openDirectoryPickerDialog({
        title: "Open notebook",
        multiple: false,
      })

      if (typeof platformResult === "string") {
        return normalizeDirectory(platformResult)
      }
      if (Array.isArray(platformResult) && typeof platformResult[0] === "string") {
        return normalizeDirectory(platformResult[0])
      }
      if (platformResult === null) {
        return null
      }
    } catch (error) {
      console.error("Failed to open native directory picker", error)
    }
  }

  const tauriResult = await window.__TAURI__?.dialog?.open?.({
    directory: true,
    multiple: false,
    title: "Open notebook",
  })

  if (typeof tauriResult === "string") {
    return normalizeDirectory(tauriResult)
  }

  const electronResult = await window.electronAPI?.openDirectoryPickerDialog?.()
  if (typeof electronResult === "string") {
    return normalizeDirectory(electronResult)
  }

  if (Array.isArray(tauriResult) && typeof tauriResult[0] === "string") {
    return normalizeDirectory(tauriResult[0])
  }
  if (Array.isArray(electronResult) && typeof electronResult[0] === "string") {
    return normalizeDirectory(electronResult[0])
  }

  return null
}

export async function pickProjectDirectory() {
  const platform = getPlatform()
  const hasDesktopBridge =
    typeof platform.openDirectoryPickerDialog === "function" ||
    typeof window.__TAURI__?.dialog?.open === "function" ||
    typeof window.electronAPI?.openDirectoryPickerDialog === "function"

  const picked = await openDesktopDirectoryPicker()
  if (picked) return picked
  if (hasDesktopBridge) return null

  const input = window.prompt("Enter the absolute notebook directory path")
  if (!input) return null

  const normalized = normalizeDirectory(input)
  if (!normalized) return null

  if (!hasAbsolutePath(normalized)) {
    throw new Error("Please enter an absolute directory path")
  }

  return normalized
}
