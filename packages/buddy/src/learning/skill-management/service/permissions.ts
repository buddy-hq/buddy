import { PermissionNext, type PermissionAction } from "@buddy/opencode-adapter/permission"
import { Wildcard } from "@buddy/opencode-adapter/wildcard"
import { Config } from "@buddy/backend/config"
import type {
  PermissionRule,
  PermissionRuleset,
  SkillPermissionSource,
  SkillRuleAction,
} from "./contracts"

const SKILL_RULE_DEFAULTS = {
  permission: "skill",
  wildcardPattern: "*",
  defaultAction: "allow",
  allowedAction: "allow",
  deniedAction: "deny",
} as const satisfies {
  permission: string
  wildcardPattern: string
  defaultAction: SkillRuleAction
  allowedAction: SkillRuleAction
  deniedAction: PermissionAction
}

const SKILL_PERMISSION_SOURCE = {
  default: "default",
  explicit: "explicit",
  inherited: "inherited",
} as const satisfies Record<string, SkillPermissionSource>

function matchSkillRule(name: string, ruleset: PermissionRuleset) {
  for (let index = ruleset.length - 1; index >= 0; index -= 1) {
    const rule = ruleset[index]
    if (!rule) continue
    if (!Wildcard.match(SKILL_RULE_DEFAULTS.permission, rule.permission)) continue
    if (!Wildcard.match(name, rule.pattern)) continue
    return rule
  }

  return undefined
}

function normalizeSkillAction(action: PermissionAction): SkillRuleAction {
  return action === SKILL_RULE_DEFAULTS.deniedAction
    ? SKILL_RULE_DEFAULTS.deniedAction
    : SKILL_RULE_DEFAULTS.allowedAction
}

function isPermissionAction(value: unknown): value is PermissionAction {
  return value === "allow" || value === "deny" || value === "ask"
}

function normalizeExistingSkillAction(action: unknown): SkillRuleAction {
  return isPermissionAction(action)
    ? normalizeSkillAction(action)
    : SKILL_RULE_DEFAULTS.defaultAction
}

export function resolveSkillPermission(name: string, ruleset: PermissionRuleset) {
  const matchedRule = matchSkillRule(name, ruleset)
  if (!matchedRule) {
    return {
      explicit: false,
      rule: {
        action: SKILL_RULE_DEFAULTS.defaultAction,
        permission: SKILL_RULE_DEFAULTS.permission,
        pattern: SKILL_RULE_DEFAULTS.wildcardPattern,
      } satisfies PermissionRule,
    }
  }

  return {
    explicit: true,
    rule: {
      ...matchedRule,
      action: normalizeSkillAction(matchedRule.action),
    },
  }
}

export function skillRuleset(config: Config.Info): PermissionRuleset {
  if (!config.permission) return []
  return PermissionNext.fromConfig(config.permission)
}

export function enabledAction(action: SkillRuleAction) {
  return action === SKILL_RULE_DEFAULTS.allowedAction
}

export function resolvePermissionSource(input: {
  explicit: boolean
  matchedPattern: string
  skillName: string
}): SkillPermissionSource {
  if (!input.explicit) {
    return SKILL_PERMISSION_SOURCE.default
  }

  if (input.matchedPattern === input.skillName) {
    return SKILL_PERMISSION_SOURCE.explicit
  }

  return SKILL_PERMISSION_SOURCE.inherited
}

export async function setSkillPermission(pattern: string, action: SkillRuleAction) {
  const current = await Config.getGlobal()
  const existingPermission = current.permission
  const existingSkillPermission =
    existingPermission && typeof existingPermission !== "string"
      ? existingPermission.skill
      : undefined

  const normalizedExistingSkillPermission =
    typeof existingSkillPermission === "string"
      ? {
          [SKILL_RULE_DEFAULTS.wildcardPattern]: normalizeExistingSkillAction(existingSkillPermission),
        }
      : Object.fromEntries(
          Object.entries(existingSkillPermission ?? {}).map(([rulePattern, ruleAction]) => [
            rulePattern,
            normalizeExistingSkillAction(ruleAction),
          ]),
        )

  const nextSkillPermission = {
    ...normalizedExistingSkillPermission,
    [pattern]: action,
  }

  const nextPermission = Config.Permission.parse(
    typeof existingPermission === "string"
      ? {
          [SKILL_RULE_DEFAULTS.wildcardPattern]: existingPermission,
          [SKILL_RULE_DEFAULTS.permission]: nextSkillPermission,
        }
      : {
          ...existingPermission,
          [SKILL_RULE_DEFAULTS.permission]: nextSkillPermission,
        },
  )

  await Config.updateGlobal({
    permission: nextPermission,
  })
}

export async function clearSkillPermission(pattern: string) {
  const current = await Config.getGlobal()
  const existingPermission = current.permission
  if (!existingPermission || typeof existingPermission === "string") {
    return
  }

  const existingSkillPermission = existingPermission.skill
  const nextPermission = { ...existingPermission } as Record<string, unknown>

  if (typeof existingSkillPermission === "string") {
    if (pattern !== SKILL_RULE_DEFAULTS.wildcardPattern) {
      return
    }

    delete nextPermission[SKILL_RULE_DEFAULTS.permission]
    await Config.updateGlobal({
      permission: Config.Permission.parse(nextPermission),
    })
    return
  }

  if (!existingSkillPermission || !(pattern in existingSkillPermission)) {
    return
  }

  const nextSkillPermission = { ...existingSkillPermission }
  delete nextSkillPermission[pattern]

  if (Object.keys(nextSkillPermission).length === 0) {
    delete nextPermission[SKILL_RULE_DEFAULTS.permission]
  } else {
    nextPermission[SKILL_RULE_DEFAULTS.permission] = nextSkillPermission
  }

  await Config.updateGlobal({
    permission: Config.Permission.parse(nextPermission),
  })
}
