import { getPlatform } from "../context/platform"
import { language } from "@/context/language"

const RESOURCE_PICKER_TITLE = language.t("pickers.resourcePickerTitle")

function normalizePath(input: string) {
  const trimmed = input.trim().split("\\").join("/")
  if (!trimmed) return ""
  if (trimmed === "/") return trimmed
  return trimmed.replace(/\/+$/, "")
}

function toFirstPath(input: string | string[] | null) {
  if (typeof input === "string") return normalizePath(input)
  if (Array.isArray(input) && typeof input[0] === "string") return normalizePath(input[0])
  return null
}

export async function pickResourceFilePath(): Promise<string | null> {
  const platform = getPlatform()

  if (typeof platform.openFilePickerDialog === "function") {
    const platformResult = await platform.openFilePickerDialog({
      title: RESOURCE_PICKER_TITLE,
      multiple: false,
    })
    const pickedPath = toFirstPath(platformResult)
    if (!pickedPath) return null
    return pickedPath
  }

  const electronResult = await window.electronAPI?.openFilePickerDialog?.()
  const electronPath = toFirstPath(electronResult ?? null)
  if (electronPath) {
    return electronPath
  }

  throw new Error(language.t("pickers.filePickerUnavailable"))
}
