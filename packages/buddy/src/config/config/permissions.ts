import { mergeDeep } from "remeda"
import { InvalidError } from "../errors.js"
import { Permission } from "./types.js"
import type { Info, PermissionAction } from "./types.js"

const EDIT_ALIASES = new Set(["write", "edit", "patch", "multiedit"])

export function applyEnvironmentPermission(config: Info, rawPermission: string): void {
  const raw = JSON.parse(rawPermission) as unknown
  const parsed = Permission.safeParse(raw)
  if (!parsed.success) {
    throw new InvalidError({
      path: "BUDDY_PERMISSION",
      issues: parsed.error.issues,
    })
  }

  config.permission = mergeDeep(config.permission ?? {}, parsed.data)
}

export function applyToolPermissionDefaults(config: Info): void {
  if (!config.tools) return

  const permissionFromTools: Record<string, PermissionAction> = {}
  for (const [tool, enabled] of Object.entries(config.tools)) {
    const action: PermissionAction = enabled ? "allow" : "deny"
    if (EDIT_ALIASES.has(tool)) {
      permissionFromTools.edit = action
      continue
    }
    permissionFromTools[tool] = action
  }

  config.permission = mergeDeep(permissionFromTools, config.permission ?? {})
}
