import path from "node:path"
import { Global } from "@buddy/opencode-adapter/global"
import { Truncate } from "@buddy/opencode-adapter/tool"
import { Config } from "../config.js"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
} from "./agents.js"
import { fingerprintOpenCodeConfig } from "./fingerprint.js"
import { parseConfiguredModel } from "./models.js"
import { resolveBuddyBundledSkillRoots, resolveOpenCodeSkillPaths } from "./skills.js"
import { getDefaultBuddyPersonaMetadata } from "../../learning/personas/wiring/persona-metadata"

const BUDDY_RUNTIME_PERMISSION_OVERLAY: Config.Permission = {
  "goal_*": "deny",
  "learner_*": "deny",
  ingest_full_text: "deny",
  prepare_resource: "deny",
  "python_*": "deny",
  "render_*": "deny",
  "teaching_*": "deny",
  websearch: "allow",
  codesearch: "allow",
}

/**
 * Commands injected into every session via the config overlay.
 * Keyed by slash-command name (e.g. "flashcard" → `/flashcard`).
 */
const BUDDY_BUILTIN_COMMANDS: Record<string, { template: string; description: string }> = {
  flashcard: {
    description: "Generate flashcards from context in learn mode",
    template: [
      "Create flashcards about $ARGUMENTS",
      "",
      "Use the flashcard-author subagent if it is available. If no arguments are provided, create flashcards based on the current conversation and context.",
      "",
      "Before delegating to the flashcard-author subagent, use the task prompt to pass along the learner's requested scope and any relevant conversation context. Keep the short task description concise, but make the delegated prompt itself specific.",
      "",
      "If the task is grounded in one or more resources, do not replace those resources with your own summary. Instead, enumerate each relevant resource in the delegation prompt with its title, alias or resource key when known, and the prepared full-text path when available. State the exact scope to read from each resource, and explicitly tell the flashcard-author subagent to call `ingest_full_text` for the named resources before authoring cards unless the full text is already present in the delegated context.",
      "",
      "After delegation, do not add separate rendering instructions. Decks saved by flashcard-author are surfaced automatically from persisted state.",
    ].join("\n"),
  },
}

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory" as const
const ANY_PATTERN = "*" as const
const ALLOW_ACTION: Config.PermissionAction = "allow"
const ASK_ACTION: Config.PermissionAction = "ask"

function buildExternalDirectoryRules(skillPaths: string[] | undefined): Config.PermissionRule {
  // Match OpenCode vendor defaults (agent.ts): ask for unknown externals, but allow
  // tool-output, tmp, and skill dirs. Put `*` first to override project-level allow,
  // then re-allow vendor paths so findLast resolves to allow for those patterns.
  const rules: Array<[string, Config.PermissionAction]> = [[ANY_PATTERN, ASK_ACTION]]

  rules.push([Truncate.GLOB, ALLOW_ACTION])
  rules.push([path.join(Global.Path.tmp, ANY_PATTERN), ALLOW_ACTION])

  for (const skillPath of skillPaths ?? []) {
    rules.push([path.join(skillPath, ANY_PATTERN), ALLOW_ACTION])
  }

  return Object.fromEntries(rules)
}

function buildOpenCodePermissionOverlay(
  permission: Config.Permission | undefined,
  skillPaths: string[] | undefined,
): Config.Permission {
  return {
    ...permission,
    ...BUDDY_RUNTIME_PERMISSION_OVERLAY,
    [EXTERNAL_DIRECTORY_PERMISSION]: buildExternalDirectoryRules(skillPaths),
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
  const mergedAgents = applyBuddyPersonaHiddenFlags(
    mergeBuddyAndConfiguredAgents(input.config.agent ?? {}),
    input.config.personas,
  )
  const defaultAgent = resolveConfiguredAgentKey(
    getDefaultBuddyPersonaMetadata({
      defaultPersona: input.config.default_persona,
      overrides: input.config.personas,
    }).id,
    mergedAgents,
  )
  const orderedAgents = orderAgentsWithDefaultFirst(mergedAgents, defaultAgent)

  return {
    permission: buildOpenCodePermissionOverlay(input.config.permission, skillPaths),
    ...(input.config.compaction ? { compaction: input.config.compaction } : {}),
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
    ...(input.config.mcp ? { mcp: input.config.mcp } : {}),
    command: {
      ...BUDDY_BUILTIN_COMMANDS,
    },
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
