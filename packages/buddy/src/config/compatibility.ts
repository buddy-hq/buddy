import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "./config.js"
import { configErrorMessage, isConfigValidationError } from "./errors.js"
import {
  buildOpenCodeConfigOverlay,
  fingerprintOpenCodeConfig,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
} from "./opencode/index.js"

const openCodeConfigFingerprint = new Map<string, string>()
const openCodeConfigSyncInFlight = new Map<string, Promise<void>>()

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

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  const existing = openCodeConfigSyncInFlight.get(directory)
  if (existing) return existing

  const task = (async () => {
    const config = await readProjectConfig(directory)
    const overlay = await buildOpenCodeConfigOverlay(config)
    setConfigOverlay(directory, overlay)
    const nextFingerprint = fingerprintOpenCodeConfig(config, overlay)
    const previousFingerprint = openCodeConfigFingerprint.get(directory)
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

    openCodeConfigFingerprint.set(directory, nextFingerprint)
  })().finally(() => {
    openCodeConfigSyncInFlight.delete(directory)
  })

  openCodeConfigSyncInFlight.set(directory, task)
  return task
}
