import type { PermissionRequest } from "@/state/chat-types"
import { readNonEmptyString } from "@/components/chat/tools/types"

export type TPermissionDockBody =
  | { kind: "none" }
  | {
      kind: "external_directory"
      command?: string
      file?: string
      folders: readonly string[]
    }
  | { kind: "command"; command: string }
  | { kind: "detail"; lines: readonly string[] }

function metadataString(metadata: PermissionRequest["metadata"], key: string): string | undefined {
  const value = metadata[key]
  return readNonEmptyString(value)
}

function folderScopes(request: PermissionRequest): readonly string[] {
  return request.always.length > 0 ? request.always : request.patterns
}

function pathRedundantWithHeadline(request: PermissionRequest, path: string): boolean {
  if (
    request.permission !== "read" &&
    request.permission !== "write" &&
    request.permission !== "edit" &&
    request.permission !== "apply_patch"
  ) {
    return false
  }

  const isSimpleFilename = !path.includes("/") && !path.includes("\\")
  return isSimpleFilename
}

function externalDirectoryBody(request: PermissionRequest): TPermissionDockBody {
  const file = metadataString(request.metadata, "filepath")
  const command = metadataString(request.metadata, "command")
  const folders = folderScopes(request)

  return {
    kind: "external_directory",
    file,
    command: file ? undefined : command,
    folders,
  }
}

function toolDetailBody(request: PermissionRequest): TPermissionDockBody {
  if (request.permission === "bash") {
    const command = metadataString(request.metadata, "command") ?? request.patterns[0]
    return command ? { kind: "command", command } : { kind: "none" }
  }

  const path = request.patterns[0] ?? metadataString(request.metadata, "filepath")
  if (!path || pathRedundantWithHeadline(request, path)) {
    return { kind: "none" }
  }

  return { kind: "detail", lines: [path] }
}

function genericDetailBody(request: PermissionRequest): TPermissionDockBody {
  if (request.patterns.length === 0) {
    return { kind: "none" }
  }

  return { kind: "detail", lines: request.patterns }
}

export function getPermissionDockBody(request: PermissionRequest): TPermissionDockBody {
  if (request.permission === "external_directory") {
    return externalDirectoryBody(request)
  }

  if (
    request.permission === "read" ||
    request.permission === "write" ||
    request.permission === "edit" ||
    request.permission === "apply_patch" ||
    request.permission === "bash"
  ) {
    return toolDetailBody(request)
  }

  return genericDetailBody(request)
}
