import type { PermissionRequest } from "@/state/permission-types"
import { readNonEmptyString } from "@/components/chat/tools/types"

export type TPermissionDockBody =
  | { kind: "none" }
  | { kind: "outside_notebook"; command?: string; file?: string; folders: readonly string[] }
  | { kind: "command"; command: string }
  | { kind: "detail"; lines: readonly string[] }

export function getPermissionDockBody(request: PermissionRequest): TPermissionDockBody {
  if (request.action === "outside_notebook") {
    const file = readNonEmptyString(request.file)
    return { kind: "outside_notebook", file, command: file ? undefined : readNonEmptyString(request.command), folders: request.resources }
  }
  if (request.action === "shell") {
    const command = request.resources.join("\n") || readNonEmptyString(request.command)
    return command ? { kind: "command", command } : { kind: "none" }
  }
  return request.resources.length > 0 ? { kind: "detail", lines: request.resources } : { kind: "none" }
}

export function rememberedApprovalDescription(request: PermissionRequest): string {
  const patterns = request.save ?? []
  return patterns.length > 0
    ? `Always allow ${request.action === "outside_notebook" ? "external directory" : request.action.replaceAll("_", " ")} for ${patterns.join(", ")} in this notebook's project.`
    : "This request has no patterns to remember; only this request will be allowed."
}
