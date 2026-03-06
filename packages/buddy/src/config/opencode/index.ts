import { Config } from "../config.js"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
} from "./agents.js"
import { fingerprintOpenCodeConfig } from "./fingerprint.js"
import { parseConfiguredModel } from "./models.js"
import { resolveOpenCodeSkillPaths } from "./skills.js"
import { getDefaultBuddyPersona } from "../../personas/catalog.js"

function buildOpenCodePermissionOverlay(permission: Config.Permission | undefined): Config.Permission {
  return {
    ...(permission ?? {}),
    curriculum_read: "deny",
    curriculum_update: "deny",
    goal_decide_scope: "deny",
    goal_lint: "deny",
    goal_commit: "deny",
    goal_state: "deny",
    learner_state_query: "deny",
    activity_explanation: "deny",
    activity_worked_example: "deny",
    activity_concept_contrast: "deny",
    activity_analogy: "deny",
    activity_guided_practice: "deny",
    activity_independent_practice: "deny",
    activity_debug_attempt: "deny",
    activity_stepwise_solve: "deny",
    activity_mastery_check: "deny",
    activity_reflection: "deny",
    activity_retrieval_check: "deny",
    activity_transfer_check: "deny",
    practice_record: "deny",
    assessment_record: "deny",
    render_figure: "deny",
    render_freeform_figure: "deny",
    teaching_start_lesson: "deny",
    teaching_checkpoint: "deny",
    teaching_add_file: "deny",
    teaching_set_lesson: "deny",
    teaching_restore_checkpoint: "deny",
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
}
