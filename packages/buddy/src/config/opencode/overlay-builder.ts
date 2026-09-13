import path from "node:path"
import { Global } from "@buddy/opencode-adapter/global"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
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
import { preloadBuddyBootstrapGraph } from "../../learning/runtime/bootstrap-preload"
import { resolveNotesDirectoryState } from "../../notes/settings"
import { resolveBuddyHomeState } from "../../project/buddy-home"

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
const BUDDY_BUILTIN_COMMANDS = {
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
} satisfies Record<string, { template: string; description: string }>

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory" as const
const READ_PERMISSION = "read" as const
const EDIT_PERMISSION = "edit" as const
const ANY_PATTERN = "*" as const
const ALLOW_ACTION: Config.PermissionAction = "allow"
const ASK_ACTION: Config.PermissionAction = "ask"

function appendPermissionRules(
  rule: Config.PermissionRule | undefined,
  additions: ReadonlyArray<readonly [string, Config.PermissionAction]>,
): Config.PermissionRule {
  const entries: Array<[string, Config.PermissionAction]> = []
  if (rule === "allow" || rule === "ask" || rule === "deny") {
    entries.push([ANY_PATTERN, rule])
  } else if (rule) {
    entries.push(...Object.entries(rule))
  }
  for (const [pattern, action] of additions) {
    entries.push([pattern, action])
  }
  return Object.fromEntries(entries)
}

function buildOpenCodePermissionOverlay(
  permission: Config.Permission | undefined,
  skillPaths: string[] | undefined,
  notesPermissionPatterns: {
    absoluteRoot: string
    absoluteDescendants: string
    relative?: {
      root: string
      descendants: string
    }
  },
): Config.Permission {
  return {
    ...permission,
    ...BUDDY_RUNTIME_PERMISSION_OVERLAY,
    [EXTERNAL_DIRECTORY_PERMISSION]: appendPermissionRules(
      permission?.[EXTERNAL_DIRECTORY_PERMISSION],
      [
        [Truncate.GLOB, ALLOW_ACTION],
        [path.join(Global.Path.tmp, ANY_PATTERN), ALLOW_ACTION],
        ...(skillPaths ?? []).map(
          (skillPath) => [path.join(skillPath, ANY_PATTERN), ALLOW_ACTION] as const,
        ),
        [notesPermissionPatterns.absoluteRoot, ALLOW_ACTION],
        [notesPermissionPatterns.absoluteDescendants, ALLOW_ACTION],
      ],
    ),
    [READ_PERMISSION]: appendPermissionRules(
      permission?.[READ_PERMISSION],
      notesPermissionPatterns.relative
        ? [
            [notesPermissionPatterns.relative.root, ALLOW_ACTION],
            [notesPermissionPatterns.relative.descendants, ALLOW_ACTION],
          ]
        : [],
    ),
    [EDIT_PERMISSION]: appendPermissionRules(
      permission?.[EDIT_PERMISSION],
      notesPermissionPatterns.relative
        ? [
            [notesPermissionPatterns.relative.root, ASK_ACTION],
            [notesPermissionPatterns.relative.descendants, ASK_ACTION],
          ]
        : [],
    ),
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
  await preloadBuddyBootstrapGraph()
  const [skillPaths, globalConfig] = await Promise.all([
    resolveOpenCodeSkillPaths(input.config, input.directory),
    Config.getGlobal(),
  ])
  const buddyHome = resolveBuddyHomeState(globalConfig.notebook_home)
  const notesDirectory = resolveNotesDirectoryState({
    buddyHomeDirectory: buddyHome.resolvedPath,
    configuredDirectory: globalConfig.notes_directory,
  }).resolvedDirectory
  const { project } = await OpenCodeProject.fromDirectory(input.directory)
  const relativeNotesDirectory = path.relative(project.worktree, notesDirectory)
  const notesPermissionPatterns = {
    absoluteRoot: notesDirectory,
    absoluteDescendants: path.join(notesDirectory, ANY_PATTERN),
    ...(relativeNotesDirectory
      ? {
          relative: {
            root: relativeNotesDirectory,
            descendants: path.join(relativeNotesDirectory, ANY_PATTERN),
          },
        }
      : undefined),
  }
  const mergedAgents = applyBuddyPersonaHiddenFlags(
    mergeBuddyAndConfiguredAgents(input.config.agent ?? {}),
    input.config.personas,
  )
  const defaultAgent = resolveConfiguredAgentKey(
    getDefaultBuddyPersonaMetadata({
      defaultPersona: input.config.default_persona,
      primaryUse: input.config.personalization?.primary_use,
      overrides: input.config.personas,
    }).id,
    mergedAgents,
  )
  const orderedAgents = orderAgentsWithDefaultFirst(mergedAgents, defaultAgent)

  return Object.assign(
    Object.assign(
      Object.assign(
        {
          permission: buildOpenCodePermissionOverlay(
            input.config.permission,
            skillPaths,
            notesPermissionPatterns,
          ),
          command: {
            ...BUDDY_BUILTIN_COMMANDS,
          },
          agent: {
            ...orderedAgents,
          },
        },
        input.config.compaction ? { compaction: input.config.compaction } : undefined,
        input.config.model ? { model: input.config.model } : undefined,
        input.config.small_model ? { small_model: input.config.small_model } : undefined,
      ),
      defaultAgent ? { default_agent: defaultAgent } : undefined,
      input.config.disabled_providers
        ? { disabled_providers: input.config.disabled_providers }
        : undefined,
      input.config.enabled_providers
        ? { enabled_providers: input.config.enabled_providers }
        : undefined,
    ),
    input.config.provider ? { provider: input.config.provider } : undefined,
    skillPaths ? { skills: { paths: skillPaths } } : undefined,
    input.config.mcp ? { mcp: input.config.mcp } : undefined,
  )
}

export {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
  resolveBuddyBundledSkillRoots,
}
