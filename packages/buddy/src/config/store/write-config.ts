import fsp from "node:fs/promises"
import path from "node:path"
import { isDeepEqual, mergeDeep } from "remeda"
import {
  loadConfigText,
  loadProjectConfigText,
  removeConfigDocumentValue,
  updateKnownConfigDocument,
} from "../contract/document.js"
import { preserveConfigSecrets } from "../contract/web-safe"
import { deleteUnusedMcpSecrets, storeEnteredMcpSecrets, withMcpSecretConfigLock } from "../secrets/mcp-secrets"
import { JsonError } from "../contract/errors.js"
import { parseConfigObject, parseConfigString, parseNodeErrorCode, type TConfigJsonValue } from "../parse-values.js"
import { resetGlobalConfigCache } from "./global-cache.js"
import {
  resolveGlobalConfigFile,
  resolveProjectConfigContext,
  resolveProjectConfigFile,
} from "./config-paths.js"
import { Info, ProjectInfo } from "./types.js"
import type { Mcp, Info as ConfigInfo, ProjectInfo as ProjectConfigInfo } from "./types.js"

type GlobalConfigMutation = (current: ConfigInfo) => ConfigInfo
type ConfigDocumentLoader<TConfig> = (
  text: string,
  filepath: string,
  options?: { resolveSubstitutions?: boolean },
) => Promise<TConfig>

const LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH = ["learner_memory", "master_enabled"] as const

let globalConfigChangeLock: Promise<void> | undefined

async function ensureParentDirectory(filepath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
}

async function readConfigTextOrDefault(filepath: string): Promise<string> {
  return fsp.readFile(filepath, "utf8").catch((error) => {
    if (parseNodeErrorCode(error) === "ENOENT") return "{}"
    throw new JsonError({ path: filepath }, { cause: error })
  })
}

function preserveConfigReferences(
  next: TConfigJsonValue | undefined,
  current: TConfigJsonValue | undefined,
  resolved: TConfigJsonValue | undefined,
): TConfigJsonValue | undefined {
  const text = parseConfigString(current)
  if (text !== undefined && /\{(?:env|file|secret):/u.test(text) && isDeepEqual(next, resolved)) {
    return text
  }
  if (Array.isArray(next)) {
    return next.map((entry, index) => preserveConfigReferences(
      entry,
      Array.isArray(current) ? current[index] : undefined,
      Array.isArray(resolved) ? resolved[index] : undefined,
    ) ?? null)
  }
  const nextRecord = parseConfigObject(next)
  if (!nextRecord) return next
  const currentRecord = parseConfigObject(current)
  const resolvedRecord = parseConfigObject(resolved)
  return Object.fromEntries(Object.entries(nextRecord).map(([key, value]) => [
    key,
    preserveConfigReferences(value, currentRecord?.[key], resolvedRecord?.[key]),
  ]))
}

async function writeConfigDocument<TConfig>(input: {
  filepath: string
  before: string
  next: TConfig
  load: ConfigDocumentLoader<TConfig>
  storeMcpSecrets?: boolean
}): Promise<void> {
  const current = await input.load(input.before, input.filepath)
  const resolved = await input.load(input.before, input.filepath, { resolveSubstitutions: true }).catch(() => undefined)
  const references = resolved === undefined ? input.next : preserveConfigReferences(
    parseConfigObject(input.next),
    parseConfigObject(current),
    parseConfigObject(resolved),
  )
  const preserved = preserveConfigSecrets(references, current)
  const next = input.storeMcpSecrets === true ? await storeEnteredMcpSecrets(preserved, current) : preserved
  let updated = updateKnownConfigDocument(input.before, current, next, input.filepath)

  updated = removeConfigDocumentValue(updated, input.filepath, [
    ...LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH,
  ])

  await input.load(updated, input.filepath)
  await fsp.writeFile(input.filepath, updated, "utf8")
}

function loadGlobalConfigDocument(
  text: string,
  filepath: string,
  options: { resolveSubstitutions?: boolean } = { resolveSubstitutions: false },
): Promise<ConfigInfo> {
  return loadConfigText(text, {
    dir: path.dirname(filepath),
    source: filepath,
  }, options)
}

function loadProjectConfigDocument(
  text: string,
  filepath: string,
  options: { resolveSubstitutions?: boolean } = { resolveSubstitutions: false },
): Promise<ProjectConfigInfo> {
  return loadProjectConfigText(text, {
    dir: path.dirname(filepath),
    source: filepath,
  }, options)
}

async function withGlobalConfigChangeLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalConfigChangeLock ?? Promise.resolve()
  let releaseLock!: () => void
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const queued = previous.finally(() => current)
  globalConfigChangeLock = queued
  await previous.catch(() => undefined)

  try {
    return await task()
  } finally {
    releaseLock()
    if (globalConfigChangeLock === queued) {
      globalConfigChangeLock = undefined
    }
  }
}

export async function updateProjectConfig(
  directory: string,
  config: ProjectConfigInfo,
): Promise<void> {
  return withMcpSecretConfigLock(async () => {
    const { configDirectory } = await resolveProjectConfigContext(directory)
    const filepath = resolveProjectConfigFile(configDirectory)
    await ensureParentDirectory(filepath)

    const before = await readConfigTextOrDefault(filepath)
    await writeConfigDocument({
      filepath,
      before,
      next: config,
      load: loadProjectConfigDocument,
      storeMcpSecrets: true,
    })
  })
}

export async function setProjectMcpConfig(
  directory: string,
  name: string,
  mcp: Mcp,
): Promise<void> {
  return withMcpSecretConfigLock(async () => {
    const { configDirectory } = await resolveProjectConfigContext(directory)
    const filepath = resolveProjectConfigFile(configDirectory)
    await ensureParentDirectory(filepath)

    const before = await readConfigTextOrDefault(filepath)
    const current = await loadProjectConfigDocument(before, filepath)
    const resolved = await loadProjectConfigDocument(before, filepath, { resolveSubstitutions: true }).catch(() => undefined)
    const next = ProjectInfo.parse({
      ...current,
      mcp: {
        ...current.mcp,
        [name]: mcp,
      },
    })
    const references = resolved === undefined ? next : preserveConfigReferences(next, current, resolved)
    const preserved = preserveConfigSecrets(references, current)
    let updated = removeConfigDocumentValue(before, filepath, [
      ...LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH,
    ])
    updated = updateKnownConfigDocument(updated, current, await storeEnteredMcpSecrets(preserved, current), filepath)
    await loadProjectConfigDocument(updated, filepath)
    await fsp.writeFile(filepath, updated, "utf8")
  })
}

export async function updateGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig((current) => Info.parse(mergeDeep(current, config)))
}

export async function replaceGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig(() => config)
}

async function writeGlobalConfig(filepath: string, mutation: GlobalConfigMutation): Promise<string> {
  return withMcpSecretConfigLock(async () => {
    const before = await readConfigTextOrDefault(filepath)
    const current = await loadGlobalConfigDocument(before, filepath)
    const next = Info.parse(mutation(current))

    await writeConfigDocument({
      filepath,
      before,
      next,
      load: loadGlobalConfigDocument,
      storeMcpSecrets: true,
    })
    return before
  })
}

export async function mutateGlobalConfig(mutation: GlobalConfigMutation): Promise<ConfigInfo> {
  return withGlobalConfigChangeLock(async () => {
    const filepath = resolveGlobalConfigFile()
    await ensureParentDirectory(filepath)

    const before = await writeGlobalConfig(filepath, mutation)

    resetGlobalConfigCache()
    const { refreshActiveNotebookConfigs } = await import("../runtime/opencode-sync")
    await refreshActiveNotebookConfigs()
    await deleteUnusedMcpSecrets({ filepath, before })

    return loadGlobalConfigDocument(await fsp.readFile(filepath, "utf8"), filepath)
  })
}
