import {
  constrainPermissionGrants,
  evaluatePermission,
  matchPermissionPattern,
  type PermissionAction,
  type PermissionRule,
  type PermissionRuleset,
} from "@buddy/transcript-contract/permission-rules"
import { canonicalPermissionAction } from "@buddy/transcript-contract/permission-rules"

export type RuntimePermissionAccess = {
  tools: Readonly<Record<string, PermissionAction>>
  subagents: Readonly<Record<string, PermissionAction>>
  skills: Readonly<Record<string, PermissionAction>>
}

function canonicalRules(rules: PermissionRuleset): PermissionRuleset {
  return rules.map((rule) => ({
    permission: canonicalPermissionAction(rule.permission),
    pattern: rule.pattern,
    action: rule.action,
  }))
}

export function buildDelegatedChildSessionPermissions(input: {
  parentRuntime: { access: RuntimePermissionAccess }
  existing: PermissionRuleset
  denyTools?: readonly string[]
  configured?: PermissionRuleset
  platform?: "posix" | "win32"
  source?: PermissionRuleset
  extraTools?: readonly string[]
  rolePermissions?: PermissionRuleset
  toolActions?: Readonly<Record<string, string>>
  priorSource?: PermissionRuleset
}): PermissionRuleset {
  const access = input.parentRuntime.access
  if (input.source !== undefined) {
    const actionFor = (action: string) =>
      input.toolActions?.[action] ?? canonicalPermissionAction(action)
    const normalize = (rules: PermissionRuleset) =>
      rules.map((rule) => ({ ...rule, permission: actionFor(rule.permission) }))
    const extras = new Set((input.extraTools ?? []).map(actionFor))
    const inherited = normalize(input.source).filter(
      (rule) => !(extras.has(rule.permission) && rule.pattern === "*" && rule.action === "deny"),
    )
    const prior = normalize(input.priorSource ?? input.source)
    const childRules = normalize(input.existing).filter(
      (rule) =>
        !prior.some(
          (old) =>
            old.permission === rule.permission &&
            old.pattern === rule.pattern &&
            old.action === rule.action,
        ) &&
        (rule.pattern !== "*" ||
          (!(rule.permission in access.tools) &&
            rule.permission !== "subagent" &&
            rule.permission !== "skill")),
    )
    const grants = constrainPermissionGrants(
      [...extras].map(
        (permission): PermissionRule => ({ permission, pattern: "*", action: "allow" }),
      ),
      normalize(input.configured ?? []),
      [...extras],
      input.platform,
    )
    const role = normalize(input.rolePermissions ?? [])
    const restrictions = role.filter((rule) => rule.action !== "allow")
    const roleEnvelope = role.some((rule) => rule.permission === "*" && rule.action === "deny")
      ? role
      : restrictions
    const constraints = [...inherited, ...childRules.filter((rule) => rule.action !== "allow")]
    const parentRestrictions = roleEnvelope.flatMap((rule): PermissionRule[] => {
      if (rule.action !== "allow") return []
      if (rule.pattern !== "*") {
        const effect = evaluatePermission(
          rule.permission,
          rule.pattern,
          constraints,
          input.platform,
        ).action
        return effect === "allow" ? [] : [{ ...rule, action: effect }]
      }
      return constraints.flatMap((parent): PermissionRule[] => {
        if (!matchPermissionPattern(rule.permission, parent.permission, input.platform)) return []
        const effect = evaluatePermission(
          rule.permission,
          parent.pattern,
          constraints,
          input.platform,
        ).action
        const roleEffect = evaluatePermission(
          rule.permission,
          parent.pattern,
          roleEnvelope,
          input.platform,
        ).action
        if (roleEffect === "deny") return []
        return [
          {
            permission: rule.permission,
            pattern: parent.pattern,
            action: effect === "allow" ? roleEffect : effect,
          },
        ]
      })
    })
    const runtimeDenies = Object.entries(access.tools)
      .filter(([tool, effect]) => effect === "deny" && !extras.has(actionFor(tool)))
      .map(
        ([tool]): PermissionRule => ({ permission: actionFor(tool), pattern: "*", action: "deny" }),
      )
    return canonicalRules([
      ...grants,
      ...inherited,
      ...normalize(input.configured ?? []),
      ...childRules,
      ...roleEnvelope,
      ...parentRestrictions,
      ...runtimeDenies,
      ...(input.denyTools ?? []).map(
        (permission): PermissionRule => ({
          permission: actionFor(permission),
          pattern: "*",
          action: "deny",
        }),
      ),
    ])
  }
  const toolActions = new Set(Object.keys(access.tools).map(canonicalPermissionAction))
  const subagents = new Set(Object.keys(access.subagents))
  const skills = new Set(Object.keys(access.skills))
  const preserved = input.existing.filter((rule) => {
    const action = canonicalPermissionAction(rule.permission)
    return (
      !(toolActions.has(action) && rule.pattern === "*") &&
      !(action === "subagent" && subagents.has(rule.pattern)) &&
      !(action === "skill" && skills.has(rule.pattern))
    )
  })
  const rules = canonicalRules([
    ...Object.entries(access.tools).map(([permission, action]) => ({
      permission,
      pattern: "*",
      action,
    })),
    ...Object.entries(access.subagents).map(([pattern, action]) => ({
      permission: "subagent",
      pattern,
      action,
    })),
    ...Object.entries(access.skills).map(([pattern, action]) => ({
      permission: "skill",
      pattern,
      action,
    })),
  ])
  const denyRules = (input.denyTools ?? []).map(
    (permission): PermissionRule => ({ permission, pattern: "*", action: "deny" }),
  )
  const configured = canonicalRules(input.configured ?? [])
  const grants = constrainPermissionGrants(
    rules.filter((rule) => rule.action !== "deny"),
    configured,
    rules.map((rule) => rule.permission),
    input.platform,
  )
  return canonicalRules([
    ...grants,
    ...preserved,
    ...rules.filter((rule) => rule.action === "deny"),
    ...denyRules,
  ])
}
