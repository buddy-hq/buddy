import { language } from "@/context/language"
import type { PermissionRequest } from "@/state/chat-types"

export type TPermissionDockTitleIcon = "read" | "edit" | "command" | "shield"

export type TPermissionDockHeadline = {
  title: string
  icon: TPermissionDockTitleIcon
}

function metadataString(metadata: PermissionRequest["metadata"], key: string): string | undefined {
  const value = metadata[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function pathBasename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "")
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function isFileEditPermission(permission: string): boolean {
  return permission === "write" || permission === "edit" || permission === "apply_patch"
}

function prefixedTitle(action: string): string {
  return `${language.t("chat.permissionDock.permissionNeeded")}: ${action}`
}

export function getPermissionDockHeadline(request: PermissionRequest): TPermissionDockHeadline {
  if (request.permission === "external_directory") {
    return {
      icon: "shield",
      title: prefixedTitle(language.t("chat.permissionDock.action.externalDirectory")),
    }
  }

  if (request.permission === "read") {
    const path = request.patterns[0] ?? metadataString(request.metadata, "filepath")
    return {
      icon: "read",
      title: path
        ? prefixedTitle(language.t("chat.permissionDock.action.read", { path: pathBasename(path) }))
        : prefixedTitle(language.t("chat.permissionDock.action.readGeneric")),
    }
  }

  if (isFileEditPermission(request.permission)) {
    const path = request.patterns[0] ?? metadataString(request.metadata, "filepath")
    return {
      icon: "edit",
      title: path
        ? prefixedTitle(language.t("chat.permissionDock.action.edit", { path: pathBasename(path) }))
        : prefixedTitle(language.t("chat.permissionDock.action.editGeneric")),
    }
  }

  if (request.permission === "bash") {
    return {
      icon: "command",
      title: prefixedTitle(language.t("chat.permissionDock.action.bash")),
    }
  }

  return {
    icon: "shield",
    title: language.t("chat.permissionDock.permissionNeeded"),
  }
}
