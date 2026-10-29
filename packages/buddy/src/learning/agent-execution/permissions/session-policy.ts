import {
  constrainPermissionGrants,
  type PermissionRule,
  type PermissionRuleset,
} from "@buddy/transcript-contract/permission-rules"
import type { RuntimePermissionAccess } from "./delegated-permissions"

export type RuntimePermissionCatalog = {
  toolIDs: readonly string[]
  subagentIDs: readonly string[]
  skillNames: readonly string[]
  dynamicToolIDs: readonly string[]
}

export function buildRuntimeSessionPermissionRules(input: {
  catalog: RuntimePermissionCatalog
  existing?: PermissionRuleset
  sessionRuntime?: { access: RuntimePermissionAccess }
  hasParentSession?: boolean
  configured?: PermissionRuleset
  platform?: "posix" | "win32"
}): PermissionRuleset {
  const { catalog, sessionRuntime } = input
  if (!sessionRuntime && input.hasParentSession && input.existing !== undefined)
    return input.existing
  const tools = new Set(catalog.toolIDs)
  const dynamic = new Set(catalog.dynamicToolIDs)
  const subagents = new Set(catalog.subagentIDs)
  const skills = new Set([
    ...catalog.skillNames,
    ...Object.keys(sessionRuntime?.access.skills ?? {}),
  ])
  const preserved = (input.existing ?? []).filter((rule) => {
    if ((tools.has(rule.permission) || dynamic.has(rule.permission)) && rule.pattern === "*")
      return false
    if (rule.permission === "skill" && skills.has(rule.pattern)) return false
    return !(
      (rule.permission === "task" || rule.permission === "subagent") &&
      subagents.has(rule.pattern)
    )
  })
  const dynamicDenies = catalog.dynamicToolIDs.map(
    (permission): PermissionRule => ({ permission, pattern: "*", action: "deny" }),
  )
  if (sessionRuntime === undefined) return [...preserved, ...dynamicDenies]
  const { access } = sessionRuntime
  const managed: PermissionRuleset = [
    ...catalog.toolIDs.map(
      (permission): PermissionRule => ({
        permission,
        pattern: "*",
        action: access.tools[permission] ?? "deny",
      }),
    ),
    ...catalog.subagentIDs.map(
      (pattern): PermissionRule => ({
        permission: "subagent",
        pattern,
        action: access.subagents[pattern] ?? "deny",
      }),
    ),
    ...Object.entries(access.skills).map(
      ([pattern, action]): PermissionRule => ({ permission: "skill", pattern, action }),
    ),
  ]
  const grants = constrainPermissionGrants(
    managed.filter((rule) => rule.action !== "deny"),
    input.configured ?? [],
    managed.map((rule) => rule.permission),
    input.platform,
  )
  return [
    ...grants,
    ...preserved,
    ...managed.filter((rule) => rule.action === "deny"),
    ...dynamicDenies,
  ]
}
