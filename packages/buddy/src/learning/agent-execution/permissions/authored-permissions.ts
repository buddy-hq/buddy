import {
  canonicalPermissionAction,
  permissionRulesFromConfig,
} from "@buddy/transcript-contract/permission-rules"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"

export async function readAuthoredPermissionRules(
  directory: string,
  agent?: string,
): Promise<PermissionRuleset> {
  const { Config } = await import("../../../config/config")
  const config = await Config.getProject(directory)
  const persona = agent ?? config.default_persona
  const agentPermission = persona === undefined ? undefined : config.agent?.[persona]?.permission
  const rules = [
    ...permissionRulesFromConfig(config.permission ?? {}),
    ...permissionRulesFromConfig(agentPermission ?? {}),
  ]
  return rules.map((rule) => ({
    permission: canonicalPermissionAction(rule.permission),
    pattern: rule.pattern,
    action: rule.action,
  }))
}
