import { Config } from "../config.js"
import { mergeBuddyAndConfiguredAgents, resolveConfiguredAgentKey } from "./agents.js"
import { fingerprintOpenCodeConfig } from "./fingerprint.js"
import { parseConfiguredModel } from "./models.js"
import { resolveOpenCodeSkillPaths } from "./skills.js"

function buildOpenCodePermissionOverlay(permission: Config.Permission | undefined): Config.Permission {
  return {
    ...(permission ?? {}),
    curriculum_read: "deny",
    curriculum_update: "deny",
    goal_decide_scope: "deny",
    goal_lint: "deny",
    goal_commit: "deny",
    goal_state: "deny",
    teaching_start_lesson: "deny",
    teaching_checkpoint: "deny",
    teaching_add_file: "deny",
    teaching_set_lesson: "deny",
    teaching_restore_checkpoint: "deny",
  }
}

async function buildOpenCodeConfigOverlay(config: Config.Info) {
  const skillPaths = await resolveOpenCodeSkillPaths(config)
  const agentOverlay = mergeBuddyAndConfiguredAgents(config.agent ?? {})
  const defaultAgent =
    typeof config.default_agent === "string" && config.default_agent.trim().length > 0
      ? resolveConfiguredAgentKey(config.default_agent, agentOverlay)
      : undefined

  return {
    permission: buildOpenCodePermissionOverlay(config.permission),
    ...(config.model ? { model: config.model } : {}),
    ...(config.small_model ? { small_model: config.small_model } : {}),
    ...(defaultAgent ? { default_agent: defaultAgent } : {}),
    ...(config.disabled_providers ? { disabled_providers: config.disabled_providers } : {}),
    ...(config.enabled_providers ? { enabled_providers: config.enabled_providers } : {}),
    ...(config.provider ? { provider: config.provider } : {}),
    ...(skillPaths ? { skills: { paths: skillPaths } } : {}),
    ...(config.mcp ? { mcp: config.mcp } : {}),
    agent: {
      ...agentOverlay,
    },
  }
}

export {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
}
