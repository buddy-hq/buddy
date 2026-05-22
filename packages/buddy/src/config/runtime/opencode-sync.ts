import { createHash } from "node:crypto"
import "../../pi-backend/opencode-environment"
import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  readProjectConfig,
  readProjectConfigFile,
  resolveConfiguredAgentKey,
} from "./config-access.js"
import { resolveBuddySkillPaths } from "../skills/paths.js"
import { getDefaultBuddyPersonaMetadata } from "../../learning/personas/wiring/persona-metadata.js"
import { reconcileWithdrawnLibrarySkills } from "../../learning/skill-management/service/library.js"
import { readInstalledSystemSkillsFingerprint } from "../../learning/skill-management/service/system-installer.js"
import { buddyOpenCodeInternalDirectoryGlobs } from "../../pi-backend/opencode-environment.js"

const OPENCODE_SYNC_STATE_KEY = Symbol.for("buddy.opencodeSyncState")

const BUDDY_RUNTIME_PERMISSION_OVERLAY = {
  "goal_*": "deny",
  "learner_*": "deny",
  ingest_full_text: "deny",
  prepare_resource: "deny",
  "python_*": "deny",
  "render_*": "deny",
  "teaching_*": "deny",
  websearch: "allow",
  codesearch: "allow",
} as const

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory" as const
const ANY_PATTERN = "*" as const
const ALLOW_ACTION = "allow" as const
const ASK_ACTION = "ask" as const

type OpenCodeSyncState = {
  configFingerprintByDirectory: Map<string, string>
  configSyncTaskByDirectory: Map<string, Promise<void>>
}

function getOpenCodeSyncState(): OpenCodeSyncState {
  const globalObject = globalThis as typeof globalThis & {
    [OPENCODE_SYNC_STATE_KEY]?: OpenCodeSyncState
  }

  if (!globalObject[OPENCODE_SYNC_STATE_KEY]) {
    globalObject[OPENCODE_SYNC_STATE_KEY] = {
      configFingerprintByDirectory: new Map<string, string>(),
      configSyncTaskByDirectory: new Map<string, Promise<void>>(),
    }
  }

  return globalObject[OPENCODE_SYNC_STATE_KEY]
}

function buildSkillExternalDirectoryRules(skillPaths: string[] | undefined) {
  const rules: Array<[string, typeof ALLOW_ACTION | typeof ASK_ACTION]> = [
    [ANY_PATTERN, ASK_ACTION],
  ]

  for (const pattern of buddyOpenCodeInternalDirectoryGlobs()) {
    rules.push([pattern, ALLOW_ACTION])
  }

  for (const skillPath of skillPaths ?? []) {
    rules.push([`${skillPath}/*`, ALLOW_ACTION])
  }

  return Object.fromEntries(rules)
}

function buildOpenCodePermissionOverlay(
  permission: Awaited<ReturnType<typeof readProjectConfig>>["permission"] | undefined,
  skillPaths: string[] | undefined,
) {
  return {
    ...permission,
    ...BUDDY_RUNTIME_PERMISSION_OVERLAY,
    [EXTERNAL_DIRECTORY_PERMISSION]: buildSkillExternalDirectoryRules(skillPaths),
  }
}

function orderAgentsWithDefaultFirst(
  agents: ReturnType<typeof mergeBuddyAndConfiguredAgents>,
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

async function buildOpenCodeConfigOverlay(input: {
  config: Awaited<ReturnType<typeof readProjectConfig>>
  directory: string
}): Promise<Record<string, unknown>> {
  const {
    permission,
    skills: _skills,
    default_persona,
    personas,
    personalization: _personalization,
    learner_memory: _learnerMemory,
    skills_external_vendor_roots_enabled: _skillsExternalVendorRootsEnabled,
    notebook_home: _notebookHome,
    agent: configuredAgents,
    ...sharedConfig
  } = input.config

  const skillPaths = await resolveBuddySkillPaths(input.config, input.directory)
  const mergedAgents = applyBuddyPersonaHiddenFlags(
    mergeBuddyAndConfiguredAgents(configuredAgents ?? {}),
    personas,
  )
  const defaultAgent = resolveConfiguredAgentKey(
    getDefaultBuddyPersonaMetadata({
      defaultPersona: default_persona,
      overrides: personas,
    }).id,
    mergedAgents,
  )
  const orderedAgents = orderAgentsWithDefaultFirst(mergedAgents, defaultAgent)

  return {
    ...sharedConfig,
    permission: buildOpenCodePermissionOverlay(permission, skillPaths),
    ...(skillPaths ? { skills: { paths: skillPaths } } : {}),
    agent: orderedAgents,
    ...(defaultAgent ? { default_agent: defaultAgent } : {}),
  }
}

async function buildAndApplyProjectOverlay(directory: string) {
  await reconcileWithdrawnLibrarySkills()
  const config = await readProjectConfig(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })
  setConfigOverlay(directory, overlay)
  return {
    config,
    overlay,
  }
}

async function resolveProjectConfigFingerprint(config: unknown, overlay: unknown) {
  const installedSystemSkillsFingerprint = await readInstalledSystemSkillsFingerprint().catch(
    () => undefined,
  )
  const hash = createHash("sha256")
  hash.update(JSON.stringify(config))
  hash.update("\n")
  hash.update(JSON.stringify(overlay))
  hash.update("\n")
  hash.update(installedSystemSkillsFingerprint ?? "none")
  return hash.digest("hex")
}

async function disposeProjectInstance(directory: string) {
  await OpenCodeInstance.provide({
    directory,
    fn: async () => {
      await OpenCodeInstance.dispose()
    },
  }).catch(() => undefined)
}

async function ensureOpenCodeProjectOverlay(directory: string): Promise<void> {
  await buildAndApplyProjectOverlay(directory)
}

async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  const { configFingerprintByDirectory, configSyncTaskByDirectory } = getOpenCodeSyncState()
  const existingTask = configSyncTaskByDirectory.get(directory)
  if (existingTask) {
    return existingTask
  }

  const task = (async () => {
    const { config, overlay } = await buildAndApplyProjectOverlay(directory)
    const nextFingerprint = await resolveProjectConfigFingerprint(config, overlay)
    const previousFingerprint = configFingerprintByDirectory.get(directory)

    if (!force && previousFingerprint === nextFingerprint) {
      return
    }

    await disposeProjectInstance(directory)
    configFingerprintByDirectory.set(directory, nextFingerprint)
  })().finally(() => {
    configSyncTaskByDirectory.delete(directory)
  })

  configSyncTaskByDirectory.set(directory, task)
  return task
}

export {
  buildOpenCodeConfigOverlay,
  ensureOpenCodeProjectOverlay,
  readProjectConfig,
  readProjectConfigFile,
  syncOpenCodeProjectConfig,
}
