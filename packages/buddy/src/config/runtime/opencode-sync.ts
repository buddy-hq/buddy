import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "../config.js"
import { configErrorMessage, isConfigValidationError } from "../contract/errors.js"
import { readInstalledSystemSkillsFingerprint } from "../../learning/skill-management/service/system-installer.js"
import {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
} from "../opencode/overlay-builder.js"

const OPENCODE_SYNC_STATE_KEY = Symbol.for("buddy.opencodeSyncState")

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

export {
  buildOpenCodeConfigOverlay,
  configErrorMessage,
  isConfigValidationError,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
}

export async function readProjectConfig(directory: string): Promise<Config.Info> {
  return Config.getProject(directory)
}

export async function readProjectConfigFile(directory: string): Promise<Config.Info> {
  return Config.getProjectFile(directory)
}

async function buildAndApplyProjectOverlay(directory: string) {
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

async function resolveProjectConfigFingerprint(config: Config.Info, overlay: unknown) {
  const installedSystemSkillsFingerprint = await readInstalledSystemSkillsFingerprint().catch(
    () => undefined,
  )
  return [
    fingerprintOpenCodeConfig(config, overlay),
    installedSystemSkillsFingerprint ?? "none",
  ].join("|system-skills:")
}

export async function ensureOpenCodeProjectOverlay(directory: string): Promise<void> {
  await buildAndApplyProjectOverlay(directory)
}

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  const { configFingerprintByDirectory, configSyncTaskByDirectory } = getOpenCodeSyncState()
  const existingTask = configSyncTaskByDirectory.get(directory)
  if (existingTask) return existingTask

  const task = (async () => {
    const { config, overlay } = await buildAndApplyProjectOverlay(directory)
    const nextFingerprint = await resolveProjectConfigFingerprint(config, overlay)
    const previousFingerprint = configFingerprintByDirectory.get(directory)
    if (!force && previousFingerprint === nextFingerprint) {
      return
    }

    // Dispose the OpenCode instance so it re-bootstraps fresh on next request.
    // We do NOT call PATCH /config on the vendored OpenCode because that triggers
    // Config.update which writes config.json to the project root (config pollution).
    await OpenCodeInstance.provide({
      directory,
      fn: async () => {
        await OpenCodeInstance.dispose()
      },
    })

    configFingerprintByDirectory.set(directory, nextFingerprint)
  })().finally(() => {
    configSyncTaskByDirectory.delete(directory)
  })

  configSyncTaskByDirectory.set(directory, task)
  return task
}
