import { Config } from "../config.js"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
} from "./agents.js"
import { fingerprintOpenCodeConfig } from "./fingerprint.js"
import { parseConfiguredModel } from "./models.js"
import { resolveBuddyBundledSkillRoots, resolveOpenCodeSkillPaths } from "./skills.js"
import { getDefaultBuddyPersona } from "../../learning/agents/personas"

const BUDDY_RUNTIME_PERMISSION_OVERLAY: Config.Permission = {
  curriculum_read: "deny",
  "goal_*": "deny",
  "learner_*": "deny",
  "activity_*": "deny",
  "render_*": "deny",
  "teaching_*": "deny",
}

function buildOpenCodePermissionOverlay(permission: Config.Permission | undefined): Config.Permission {
  return {
    ...(permission ?? {}),
    ...BUDDY_RUNTIME_PERMISSION_OVERLAY,
  }
}

async function buildOpenCodeConfigOverlay(config: Config.Info) {
  const skillPaths = await resolveOpenCodeSkillPaths(config)
  const agentOverlay = applyBuddyPersonaHiddenFlags(
    mergeBuddyAndConfiguredAgents(config.agent ?? {}),
    config.personas,
  )
  const defaultAgent = resolveConfiguredAgentKey(
    getDefaultBuddyPersona({
      defaultPersona: config.default_persona,
      overrides: config.personas,
    }).runtimeAgent,
    agentOverlay,
  )
  const orderedAgents =
    defaultAgent && defaultAgent in agentOverlay
      ? {
          [defaultAgent]: agentOverlay[defaultAgent]!,
          ...Object.fromEntries(
            Object.entries(agentOverlay).filter(([key]) => key !== defaultAgent),
          ),
        }
      : agentOverlay

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
      ...orderedAgents,
    },
  }
}

export {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
  resolveBuddyBundledSkillRoots,
}
