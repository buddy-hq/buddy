import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { reconcileWithdrawnLibrarySkills } from "../../learning/skill-management/service/library"
import { configErrorMessage, isConfigValidationError } from "../contract/errors"
import { canonicalizeRuntimeConfigDirectory } from "../store/directories"
import { resolveProjectConfigContext } from "../store/config-paths"
import { resetGlobalConfigCache } from "../store/global-cache"
import { buildNotebookRuntimePlan } from "./notebook-runtime-plan"
import { activeNotebookConfigLocations, NOTEBOOK_CONFIG_RPC, publishNotebookRuntimeSnapshot } from "./notebook-config-plugin"
import { readProjectConfig, readProjectConfigFile } from "./project-config"

export { buildOpenCodeConfigOverlay, mergeBuddyAndConfiguredAgents, parseConfiguredModel, resolveConfiguredAgentKey } from "../opencode/overlay-builder"
export { configErrorMessage, isConfigValidationError, readProjectConfig, readProjectConfigFile }
export { registerNotebookConfig } from "./notebook-config-plugin"
export { readOpenCodeHostConfig } from "./notebook-runtime-plan"

const tasks = new Map<string, Promise<void>>()
const preparing = new Set<string>()
let reconciliation: Promise<void> | undefined

async function withNotebookConfigLock(directory: string, operation: () => Promise<void>): Promise<void> {
  const previous = tasks.get(directory) ?? Promise.resolve()
  const task = previous.catch(() => undefined).then(operation)
  tasks.set(directory, task)
  try { await task } finally { if (tasks.get(directory) === task) tasks.delete(directory) }
}

async function refreshNotebookConfig(directory: string, force = false, requestedDirectory?: string): Promise<string> {
  preparing.add(directory)
  try {
    const plan = await buildNotebookRuntimePlan({ config: await readProjectConfig(directory), directory })
    const { revision } = publishNotebookRuntimeSnapshot(directory, plan)
    for (const location of activeNotebookConfigLocations().filter((entry) => entry.directory === directory)) {
      if (location.location.directory === requestedDirectory && location.location.workspaceID === undefined) continue
      await location.sync(revision, force)
    }
    return revision
  } finally { preparing.delete(directory) }
}

export async function syncNotebookRuntimeConfig(client: Pick<OpenCodeHost, "rpc">, directory: string, force = false): Promise<void> {
  const key = canonicalizeRuntimeConfigDirectory(directory)
  resetGlobalConfigCache()
  reconciliation ??= reconcileWithdrawnLibrarySkills(undefined, { refreshSkillRuntime: async () => undefined })
    .finally(() => { reconciliation = undefined })
  await reconciliation
  await withNotebookConfigLock(key, async () => {
    const revision = await refreshNotebookConfig(key, force, directory)
    await client.rpc.call({ rpcID: NOTEBOOK_CONFIG_RPC.id, method: "sync", input: { revision, force }, location: { directory } })
  })
  const { configDirectory } = await resolveProjectConfigContext(key)
  const siblings = new Set(activeNotebookConfigLocations().map((entry) => entry.directory))
  for (const sibling of siblings) {
    if (sibling === key || preparing.has(sibling)) continue
    if ((await resolveProjectConfigContext(sibling)).configDirectory !== configDirectory) continue
    await withNotebookConfigLock(sibling, async () => { await refreshNotebookConfig(sibling, force) })
  }
}

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  await syncNotebookRuntimeConfig(await getOpenCodeClient(), directory, force)
}

export async function ensureOpenCodeProjectOverlay(directory: string): Promise<void> {
  await syncOpenCodeProjectConfig(directory)
}

export async function refreshActiveNotebookConfigs(): Promise<void> {
  resetGlobalConfigCache()
  const directories = new Set(activeNotebookConfigLocations().map((entry) => entry.directory))
  for (const directory of directories) {
    if (preparing.has(directory)) continue
    await withNotebookConfigLock(directory, async () => { await refreshNotebookConfig(directory) })
  }
}

export async function refreshActiveNotebookSkillCatalogs(): Promise<void> {
  await refreshActiveNotebookConfigs()
}
