import fsp from "node:fs/promises"
import path from "node:path"
import { mergeDeep } from "remeda"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  loadConfigText,
  loadProjectConfigText,
  removeConfigDocumentValue,
  updateKnownConfigDocument,
} from "../contract/document.js"
import { JsonError } from "../contract/errors.js"
import { parseNodeErrorCode } from "../parse-values.js"
import { resetGlobalConfigCache } from "./global-cache.js"
import {
  resolveGlobalConfigFile,
  resolveProjectConfigContext,
  resolveProjectConfigFile,
} from "./config-paths.js"
import { Info, ProjectInfo } from "./types.js"
import type { Mcp, Info as ConfigInfo, ProjectInfo as ProjectConfigInfo } from "./types.js"

type GlobalConfigMutation = (current: ConfigInfo) => ConfigInfo
type ConfigDocumentLoader<TConfig> = (text: string, filepath: string) => Promise<TConfig>

const LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH = [
  "learner_memory",
  "master_enabled",
] as const

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

async function writeConfigDocument<TConfig>(input: {
  filepath: string
  before: string
  next: TConfig
  load: ConfigDocumentLoader<TConfig>
}): Promise<void> {
  const current = await input.load(input.before, input.filepath)
  let updated = updateKnownConfigDocument(input.before, current, input.next, input.filepath)

  updated = removeConfigDocumentValue(
    updated,
    input.filepath,
    [...LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH],
  )

  await input.load(updated, input.filepath)
  await fsp.writeFile(input.filepath, updated, "utf8")
}

function loadGlobalConfigDocument(text: string, filepath: string): Promise<ConfigInfo> {
  return loadConfigText(text, {
    dir: path.dirname(filepath),
    source: filepath,
  })
}

function loadProjectConfigDocument(text: string, filepath: string): Promise<ProjectConfigInfo> {
  return loadProjectConfigText(text, {
    dir: path.dirname(filepath),
    source: filepath,
  })
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
  const { configDirectory } = await resolveProjectConfigContext(directory)
  const filepath = resolveProjectConfigFile(configDirectory)
  await ensureParentDirectory(filepath)

  const before = await readConfigTextOrDefault(filepath)
  await writeConfigDocument({
    filepath,
    before,
    next: config,
    load: loadProjectConfigDocument,
  })
}

export async function setProjectMcpConfig(
  directory: string,
  name: string,
  mcp: Mcp,
): Promise<void> {
  const { configDirectory } = await resolveProjectConfigContext(directory)
  const filepath = resolveProjectConfigFile(configDirectory)
  await ensureParentDirectory(filepath)

  const before = await readConfigTextOrDefault(filepath)
  const current = await loadProjectConfigDocument(before, filepath)
  const next = ProjectInfo.parse({
    ...current,
    mcp: {
      ...current.mcp,
      [name]: mcp,
    },
  })
  let updated = removeConfigDocumentValue(
    before,
    filepath,
    [...LEGACY_LEARNER_MEMORY_MASTER_ENABLED_PATH],
  )
  updated = updateKnownConfigDocument(updated, current, next, filepath)
  await loadProjectConfigDocument(updated, filepath)
  await fsp.writeFile(filepath, updated, "utf8")
}

export async function updateGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig((current) => Info.parse(mergeDeep(current, config)))
}

export async function replaceGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig(() => config)
}

export async function mutateGlobalConfig(mutation: GlobalConfigMutation): Promise<ConfigInfo> {
  return withGlobalConfigChangeLock(async () => {
    const filepath = resolveGlobalConfigFile()
    await ensureParentDirectory(filepath)

    const before = await readConfigTextOrDefault(filepath)
    const current = await loadGlobalConfigDocument(before, filepath)
    const next = Info.parse(mutation(current))

    await writeConfigDocument({
      filepath,
      before,
      next,
      load: loadGlobalConfigDocument,
    })

    resetGlobalConfigCache()
    await OpenCodeInstance.disposeAll()

    return next
  })
}
