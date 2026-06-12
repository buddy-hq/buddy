import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import {
  canonicalizeRuntimeConfigDirectory,
  RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS,
} from "@buddy/opencode-adapter/config-overlay"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "../config.js"
import { reconcileWithdrawnLibrarySkills } from "../../learning/skill-management/service/library.js"
import { configErrorMessage, isConfigValidationError } from "../contract/errors.js"
import { readInstalledSystemSkillsFingerprint } from "../../learning/skill-management/service/system-installer.js"
import {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
} from "../opencode/overlay-builder.js"
import { readProjectConfig, readProjectConfigFile } from "./project-config.js"

const OPENCODE_SYNC_STATE_KEY = Symbol.for("buddy.opencodeSyncState")
const OPENCODE_CONFIG_POLICY_FINGERPRINT = "runtime-policy:mcp-authoritative-v1"

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
  readProjectConfig,
  readProjectConfigFile,
  resolveConfiguredAgentKey,
}

async function buildAndApplyProjectOverlay(directory: string) {
  await reconcileWithdrawnLibrarySkills()
  const config = await readProjectConfig(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })
  setConfigOverlay(directory, overlay, {
    authoritativeKeys: [RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS.mcp],
  })
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
    OPENCODE_CONFIG_POLICY_FINGERPRINT,
  ].join("|")
}

export async function ensureOpenCodeProjectOverlay(directory: string): Promise<void> {
  await buildAndApplyProjectOverlay(directory)
}

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  const { configFingerprintByDirectory, configSyncTaskByDirectory } = getOpenCodeSyncState()
  const directoryKey = canonicalizeRuntimeConfigDirectory(directory)
  const existingTask = configSyncTaskByDirectory.get(directoryKey)
  if (existingTask) return existingTask

  const task = (async () => {
    const { config, overlay } = await buildAndApplyProjectOverlay(directory)
    const nextFingerprint = await resolveProjectConfigFingerprint(config, overlay)
    const previousFingerprint = configFingerprintByDirectory.get(directoryKey)
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

    configFingerprintByDirectory.set(directoryKey, nextFingerprint)
  })().finally(() => {
    configSyncTaskByDirectory.delete(directoryKey)
  })

  configSyncTaskByDirectory.set(directoryKey, task)
  return task
}
