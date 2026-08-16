import { PermissionNext, type PermissionAction } from "@buddy/opencode-adapter/permission"
import { Wildcard } from "@buddy/opencode-adapter/wildcard"
import { Config } from "@buddy/backend/config"
import type {
  PermissionRule,
  PermissionRuleset,
  SkillPermissionSource,
  SkillRuleAction,
} from "./contracts"
import { parseTPermissionAction } from "../../shared/parse-values"
import { parseJsonObject } from "../../prompt/utils"

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

function normalizeExistingSkillAction<TValue>(action: TValue): SkillRuleAction {
  const parsed = parseTPermissionAction(action)
  return parsed !== undefined
    ? normalizeSkillAction(parsed)
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
  const existingPermissionAction = parseTPermissionAction(existingPermission)
  const existingSkillPermission =
    existingPermission && existingPermissionAction === undefined
      ? existingPermission.skill
      : undefined

  const existingSkillAction = parseTPermissionAction(existingSkillPermission)
  const normalizedExistingSkillPermission =
    existingSkillAction !== undefined
      ? {
          [SKILL_RULE_DEFAULTS.wildcardPattern]:
            normalizeExistingSkillAction(existingSkillAction),
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
    existingPermissionAction !== undefined
      ? {
          [SKILL_RULE_DEFAULTS.wildcardPattern]: existingPermissionAction,
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
  const existingPermissionAction = parseTPermissionAction(existingPermission)
  if (!existingPermission || existingPermissionAction !== undefined) {
    return
  }

  const { skill: existingSkillPermission, ...permissionWithoutSkill } = existingPermission

  const existingSkillAction = parseTPermissionAction(existingSkillPermission)
  if (existingSkillAction !== undefined) {
    if (pattern !== SKILL_RULE_DEFAULTS.wildcardPattern) {
      return
    }

    await Config.updateGlobal({
      permission: Config.Permission.parse(permissionWithoutSkill),
    })
    return
  }

  const skillMap = parseJsonObject(existingSkillPermission)
  if (skillMap === undefined || !(pattern in skillMap)) {
    return
  }

  const nextSkillPermission = { ...skillMap }
  delete nextSkillPermission[pattern]

  const nextPermission =
    Object.keys(nextSkillPermission).length === 0
      ? permissionWithoutSkill
      : { ...permissionWithoutSkill, skill: nextSkillPermission }

  await Config.updateGlobal({
    permission: Config.Permission.parse(nextPermission),
  })
}
