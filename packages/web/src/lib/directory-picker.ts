import { getPlatform } from "../context/platform"
import { language } from "@/context/language"

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
    electronAPI?: {
      openDirectoryPickerDialog?: () => Promise<string | string[] | null>
      openFilePickerDialog?: () => Promise<string | string[] | null>
    }
  }
}

async function openDesktopDirectoryPicker() {
  const platform = getPlatform()

  if (platform.openDirectoryPickerDialog) {
    try {
      const platformResult = await platform.openDirectoryPickerDialog({
        title: language.t("pickers.openNotebookTitle"),
        multiple: false,
      })

      if (Array.isArray(platformResult)) {
        const firstPath = platformResult[0]
        if (firstPath !== undefined) {
          return normalizeDirectory(firstPath)
        }
      } else if (platformResult !== null) {
        return normalizeDirectory(platformResult)
      }
    } catch (error) {
      console.error(language.t("pickers.openDirectoryPickerFailed"), error)
    }
  }

  const electronResult = await window.electronAPI?.openDirectoryPickerDialog?.()
  if (Array.isArray(electronResult)) {
    const firstPath = electronResult[0]
    if (firstPath !== undefined) {
      return normalizeDirectory(firstPath)
    }
  } else if (electronResult !== null && electronResult !== undefined) {
    return normalizeDirectory(electronResult)
  }

  return null
}

export async function pickProjectDirectory() {
  const platform = getPlatform()
  const hasDesktopBridge =
    Boolean(platform.openDirectoryPickerDialog) ||
    Boolean(window.electronAPI?.openDirectoryPickerDialog)

  const picked = await openDesktopDirectoryPicker()
  if (picked) return picked
  if (hasDesktopBridge) return null

  const input = window.prompt(language.t("pickers.enterAbsoluteNotebookPath"))
  if (!input) return null

  const normalized = normalizeDirectory(input)
  if (!normalized) return null

  if (!hasAbsolutePath(normalized)) {
    throw new Error(language.t("pickers.absoluteDirectoryRequired"))
  }

  return normalized
}
