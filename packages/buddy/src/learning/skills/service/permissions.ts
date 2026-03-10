import { PermissionNext, type PermissionAction } from "@buddy/opencode-adapter/permission"
import { Config } from "@buddy/backend/config"
import type { PermissionRule, PermissionRuleset, SkillPermissionSource } from "./contracts"

function wildcardMatch(input: string, pattern: string) {
  const normalizedInput = input.replaceAll("\\", "/")
  let escapedPattern = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escapedPattern.endsWith(" .*")) {
    escapedPattern = escapedPattern.slice(0, -3) + "( .*)?"
  }

  const flags = process.platform === "win32" ? "si" : "s"
  return new RegExp(`^${escapedPattern}$`, flags).test(normalizedInput)
}

function matchSkillRule(name: string, ruleset: PermissionRuleset) {
  for (let index = ruleset.length - 1; index >= 0; index -= 1) {
    const rule = ruleset[index]
    if (!rule) continue
    if (!wildcardMatch("skill", rule.permission)) continue
    if (!wildcardMatch(name, rule.pattern)) continue
    return rule
  }

  return undefined
}

export function resolveSkillPermission(name: string, ruleset: PermissionRuleset) {
  const matchedRule = matchSkillRule(name, ruleset)
  if (!matchedRule) {
    return {
      explicit: false,
      rule: {
        action: "ask",
        permission: "skill",
        pattern: "*",
      } satisfies PermissionRule,
    }
  }

  return {
    explicit: true,
    rule: matchedRule,
  }
}

export function skillRuleset(config: Config.Info): PermissionRuleset {
  if (!config.permission) return []
  return PermissionNext.fromConfig(config.permission)
}

export function enabledAction(action: PermissionAction) {
  return action !== "deny"
}

export function resolvePermissionSource(input: {
  explicit: boolean
  matchedPattern: string
  skillName: string
}): SkillPermissionSource {
  if (!input.explicit) {
    return "default"
  }

  if (input.matchedPattern === input.skillName) {
    return "explicit"
  }

  return "inherited"
}

export async function setSkillPermission(pattern: string, action: PermissionAction) {
  const current = await Config.getGlobal()
  const existingPermission = current.permission
  const existingSkillPermission =
    existingPermission && typeof existingPermission !== "string" ? existingPermission.skill : undefined

  const nextSkillPermission =
    typeof existingSkillPermission === "string"
      ? {
          "*": existingSkillPermission,
          [pattern]: action,
        }
      : {
          ...(existingSkillPermission ?? {}),
          [pattern]: action,
        }

  const nextPermission = Config.Permission.parse(
    typeof existingPermission === "string"
      ? {
          "*": existingPermission,
          skill: nextSkillPermission,
        }
      : {
          ...(existingPermission ?? {}),
          skill: nextSkillPermission,
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
    if (pattern !== "*") {
      return
    }

    delete nextPermission.skill
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
    delete nextPermission.skill
  } else {
    nextPermission.skill = nextSkillPermission
  }

  await Config.updateGlobal({
    permission: Config.Permission.parse(nextPermission),
  })
}
