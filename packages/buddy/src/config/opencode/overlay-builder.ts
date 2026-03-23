import { Config } from "../config.js"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
} from "./agents.js"
import { fingerprintOpenCodeConfig } from "./fingerprint.js"
import { parseConfiguredModel } from "./models.js"
import { resolveBuddyBundledSkillRoots, resolveOpenCodeSkillPaths } from "./skills.js"
import { getDefaultBuddyPersona } from "../../learning/personas"
import { resolveBuddySystemPromptGuardPluginUrl } from "../../opencode-runtime"

const BUDDY_RUNTIME_PERMISSION_OVERLAY: Config.Permission = {
  "goal_*": "deny",
  "learner_*": "deny",
  "pedagogy_*": "deny",
  "python_*": "deny",
  "render_*": "deny",
  "teaching_*": "deny",
  websearch: "allow",
  codesearch: "allow",
}

function buildOpenCodePermissionOverlay(
  permission: Config.Permission | undefined,
): Config.Permission {
  return {
    ...permission,
    ...BUDDY_RUNTIME_PERMISSION_OVERLAY,
  }
}

function orderAgentsWithDefaultFirst(
  agents: Record<string, Config.Agent>,
  defaultAgent: string | undefined,
) {
  if (!defaultAgent || !(defaultAgent in agents)) {
    return agents
  }

  return {
    [defaultAgent]: agents[defaultAgent]!,
    ...Object.fromEntries(Object.entries(agents).filter(([key]) => key !== defaultAgent)),
  }
}

async function buildOpenCodeConfigOverlay(input: { config: Config.Info; directory: string }) {
  const skillPaths = await resolveOpenCodeSkillPaths(input.config, input.directory)
  const systemPromptGuardPlugin = resolveBuddySystemPromptGuardPluginUrl()
  const mergedAgents = applyBuddyPersonaHiddenFlags(
    mergeBuddyAndConfiguredAgents(input.config.agent ?? {}),
    input.config.personas,
  )
  const defaultAgent = resolveConfiguredAgentKey(
    getDefaultBuddyPersona({
      defaultPersona: input.config.default_persona,
      overrides: input.config.personas,
    }).id,
    mergedAgents,
  )
  const orderedAgents = orderAgentsWithDefaultFirst(mergedAgents, defaultAgent)

  return {
    permission: buildOpenCodePermissionOverlay(input.config.permission),
    ...(input.config.model ? { model: input.config.model } : {}),
    ...(input.config.small_model ? { small_model: input.config.small_model } : {}),
    ...(defaultAgent ? { default_agent: defaultAgent } : {}),
    ...(input.config.disabled_providers
      ? { disabled_providers: input.config.disabled_providers }
      : {}),
    ...(input.config.enabled_providers
      ? { enabled_providers: input.config.enabled_providers }
      : {}),
    ...(input.config.provider ? { provider: input.config.provider } : {}),
    ...(skillPaths ? { skills: { paths: skillPaths } } : {}),
    ...(systemPromptGuardPlugin ? { plugin: [systemPromptGuardPlugin] } : {}),
    ...(input.config.mcp ? { mcp: input.config.mcp } : {}),
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
