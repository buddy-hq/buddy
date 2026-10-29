import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { reconcileWithdrawnLibrarySkills } from "../../learning/skill-management/service/library"
import { configErrorMessage, isConfigValidationError } from "../contract/errors"
import { canonicalizeRuntimeConfigDirectory } from "../store/directories"
import { resolveProjectConfigContext, resolveProjectConfigFile } from "../store/config-paths"
import { resetGlobalConfigCache } from "../store/global-cache"
import { buildNotebookRuntimePlan } from "./notebook-runtime-plan"
import { readProjectConfig, readProjectConfigFile } from "./project-config"
import { ConfigSyncError } from "./config-sync-error"

export {
  buildOpenCodeConfigOverlay,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
} from "../opencode/overlay-builder"
export { configErrorMessage, isConfigValidationError, readProjectConfig, readProjectConfigFile }
export { readOpenCodeHostConfig } from "./notebook-runtime-plan"

const tasks = new Map<string, Promise<void>>()
const preparing = new Set<string>()
let reconciliation: Promise<void> | undefined

async function withNotebookConfigLock(
  directory: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = tasks.get(directory) ?? Promise.resolve()
  const task = previous.catch(() => undefined).then(operation)
  tasks.set(directory, task)
  try {
    await task
  } finally {
    if (tasks.get(directory) === task) tasks.delete(directory)
  }
}

async function refreshNotebookConfig(
  runtime: Pick<AgentRuntime, "catalog">,
  directory: string,
  force = false,
): Promise<string> {
  preparing.add(directory)
  try {
    const plan = await buildNotebookRuntimePlan({
      config: await readProjectConfig(directory),
      directory,
    })
    const revision = await runtime.catalog.publishNotebookPlan(directory, plan)
    await runtime.catalog.syncActiveNotebookLocations(directory, revision, { force })
    return revision
  } catch (cause) {
    if (isConfigValidationError(cause)) throw cause
    const { configDirectory } = await resolveProjectConfigContext(directory)
    throw new ConfigSyncError(resolveProjectConfigFile(configDirectory), cause)
  } finally {
    preparing.delete(directory)
  }
}
export async function syncNotebookRuntimeConfig(
  directory: string,
  options: { force?: boolean; runtime?: Pick<AgentRuntime, "catalog"> } = {},
): Promise<void> {
  const { force = false } = options
  const runtime = options.runtime ?? (await getAgentRuntime())
  const key = canonicalizeRuntimeConfigDirectory(directory)
  resetGlobalConfigCache()
  reconciliation ??= reconcileWithdrawnLibrarySkills(undefined, {
    refreshSkillRuntime: async () => undefined,
  }).finally(() => {
    reconciliation = undefined
  })
  await reconciliation
  await withNotebookConfigLock(key, async () => {
    const revision = await refreshNotebookConfig(runtime, key, force)
    try {
      await runtime.catalog.syncNotebookLocation(directory, revision, { force })
    } catch (cause) {
      const { configDirectory } = await resolveProjectConfigContext(key)
      throw new ConfigSyncError(resolveProjectConfigFile(configDirectory), cause)
    }
  })
  const { configDirectory } = await resolveProjectConfigContext(key)
  const siblings = new Set(await runtime.catalog.activeNotebookDirectories())
  for (const sibling of siblings) {
    if (sibling === key || preparing.has(sibling)) continue
    if ((await resolveProjectConfigContext(sibling)).configDirectory !== configDirectory) continue
    await withNotebookConfigLock(sibling, async () => {
      await refreshNotebookConfig(runtime, sibling, force)
    })
  }
}

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  await syncNotebookRuntimeConfig(directory, { force })
}

export async function ensureOpenCodeProjectOverlay(directory: string): Promise<void> {
  await syncOpenCodeProjectConfig(directory)
}

export async function refreshActiveNotebookConfigs(): Promise<void> {
  const runtime = await getAgentRuntime()
  resetGlobalConfigCache()
  const directories = new Set(await runtime.catalog.activeNotebookDirectories())
  for (const directory of directories) {
    if (preparing.has(directory)) continue
    await withNotebookConfigLock(directory, async () => {
      await refreshNotebookConfig(runtime, directory)
    })
  }
}

export async function refreshActiveNotebookSkillCatalogs(): Promise<void> {
  await refreshActiveNotebookConfigs()
}
