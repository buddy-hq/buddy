import type { PermissionRequest } from "@/state/permission-types"
import { readNonEmptyString } from "@/components/chat/tools/types"

export type TPermissionDockBody =
  | { kind: "none" }
  | { kind: "external_directory"; command?: string; file?: string; folders: readonly string[] }
  | { kind: "command"; command: string }
  | { kind: "detail"; lines: readonly string[] }

export function getPermissionDockBody(request: PermissionRequest): TPermissionDockBody {
  if (request.action === "external_directory") {
    const file = readNonEmptyString(request.metadata?.filepath)
    return { kind: "external_directory", file, command: file ? undefined : readNonEmptyString(request.metadata?.command), folders: request.resources }
  }
  if (request.action === "shell") {
    const command = request.resources.join("\n") || readNonEmptyString(request.metadata?.command)
    return command ? { kind: "command", command } : { kind: "none" }
  }
  return request.resources.length > 0 ? { kind: "detail", lines: request.resources } : { kind: "none" }
}

export function rememberedApprovalDescription(request: PermissionRequest): string {
  const patterns = request.save ?? []
  return patterns.length > 0
    ? `Always allow ${request.action.replaceAll("_", " ")} for ${patterns.join(", ")} in this notebook's project.`
    : "This request has no patterns to remember; only this request will be allowed."
}
