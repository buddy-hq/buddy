import { mergeDeep } from "remeda"
import { Wildcard } from "@buddy/opencode-adapter/wildcard"
import { InvalidError } from "../contract/errors.js"
import { Permission } from "./types.js"
import type { Info, PermissionAction, PermissionRule } from "./types.js"

const EDIT_ALIASES = new Set(["write", "edit", "patch", "multiedit"])
const SKILL_PERMISSION_KEY = "skill" as const
const WILDCARD_PATTERN = "*" as const
const SKILL_ALLOWED_ACTION = "allow" as const
const SKILL_DENIED_ACTION = "deny" as const

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

function normalizeSkillPermissionAction(action: PermissionAction): PermissionAction {
  return action === SKILL_DENIED_ACTION ? SKILL_DENIED_ACTION : SKILL_ALLOWED_ACTION
}

function normalizeSkillPermissionRule(rule: PermissionRule): PermissionRule {
  if (typeof rule === "string") {
    return normalizeSkillPermissionAction(rule)
  }

  return Object.fromEntries(
    Object.entries(rule).map(([pattern, action]) => [pattern, normalizeSkillPermissionAction(action)]),
  )
}

function normalizedSkillPermissionEntries(
  rule: PermissionRule,
): Array<[pattern: string, action: PermissionAction]> {
  if (typeof rule === "string") {
    return [[WILDCARD_PATTERN, normalizeSkillPermissionAction(rule)]]
  }

  return Object.entries(rule).map(([pattern, action]) => [
    pattern,
    normalizeSkillPermissionAction(action),
  ])
}

function buildSkillPermissionRule(
  entries: Iterable<[pattern: string, action: PermissionAction]>,
): PermissionRule | undefined {
  const orderedEntries = new Map<string, PermissionAction>()

  for (const [pattern, action] of entries) {
    if (orderedEntries.has(pattern)) {
      orderedEntries.delete(pattern)
    }
    orderedEntries.set(pattern, action)
  }

  const wildcardAction = orderedEntries.get(WILDCARD_PATTERN)
  if (orderedEntries.size === 0) {
    return undefined
  }

  if (orderedEntries.size === 1 && wildcardAction) {
    return wildcardAction
  }

  return Object.fromEntries(orderedEntries)
}

function defaultSkillPermissionRule(permission: Record<string, PermissionRule>): PermissionRule {
  const inheritedSkillEntries = Object.entries(permission).flatMap(([permissionKey, rule]) => {
    if (permissionKey === SKILL_PERMISSION_KEY) {
      return []
    }

    if (!Wildcard.match(SKILL_PERMISSION_KEY, permissionKey)) {
      return []
    }

    return normalizedSkillPermissionEntries(rule)
  })

  return buildSkillPermissionRule(inheritedSkillEntries) ?? SKILL_ALLOWED_ACTION
}

export function applySkillPermissionDefaults(config: Info): void {
  const existingPermission = config.permission ?? {}
  const existingSkillRule = existingPermission[SKILL_PERMISSION_KEY]
  const normalizedSkillRule = existingSkillRule
    ? normalizeSkillPermissionRule(existingSkillRule)
    : defaultSkillPermissionRule(existingPermission)

  config.permission = Permission.parse({
    ...existingPermission,
    [SKILL_PERMISSION_KEY]: normalizedSkillRule,
  })
}
