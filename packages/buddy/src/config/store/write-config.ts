import fsp from "node:fs/promises"
import path from "node:path"
import { mergeDeep } from "remeda"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { parseConfigText, patchJsoncDocument, replaceJsoncDocument } from "../contract/document.js"
import { JsonError } from "../contract/errors.js"
import { resetGlobalConfigCache } from "./global-cache.js"
import {
  resolveGlobalConfigFile,
  resolveProjectConfigContext,
  resolveProjectConfigFile,
} from "./config-paths.js"
import { Info } from "./types.js"
import type { Mcp, Info as ConfigInfo } from "./types.js"

type GlobalConfigMutation = (current: ConfigInfo) => ConfigInfo

let globalConfigChangeLock: Promise<void> | undefined

async function ensureParentDirectory(filepath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
}

async function readConfigTextOrDefault(filepath: string): Promise<string> {
  return fsp.readFile(filepath, "utf8").catch((err: unknown) => {
    const maybe = err as { code?: string }
    if (maybe.code === "ENOENT") return "{}"
    throw new JsonError({ path: filepath }, { cause: err })
  })
}

function writeJsonFile(filepath: string, value: unknown): Promise<void> {
  return fsp.writeFile(filepath, JSON.stringify(value, null, 2) + "\n", "utf8")
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

export async function updateProjectConfig(directory: string, config: ConfigInfo): Promise<void> {
  const { configDirectory } = await resolveProjectConfigContext(directory)
  const filepath = resolveProjectConfigFile(configDirectory)
  await ensureParentDirectory(filepath)

  const before = await readConfigTextOrDefault(filepath)
  if (!filepath.endsWith(".jsonc")) {
    await writeJsonFile(filepath, config)
    return
  }

  const updated = replaceJsoncDocument(before, config)
  parseConfigText(updated, filepath)
  await fsp.writeFile(filepath, updated, "utf8")
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
  if (!filepath.endsWith(".jsonc")) {
    const existing = parseConfigText(before, filepath)
    const next = Info.parse({
      ...existing,
      mcp: {
        ...existing.mcp,
        [name]: mcp,
      },
    })
    await writeJsonFile(filepath, next)
    return
  }

  const updated = patchJsoncDocument(before, {
    mcp: {
      [name]: mcp,
    },
  })
  parseConfigText(updated, filepath)
  await fsp.writeFile(filepath, updated, "utf8")
}

export async function updateGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig((current) => Info.parse(mergeDeep(current, config)))
}

export async function replaceGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  return mutateGlobalConfig(() => config)
}

export async function mutateGlobalConfig(
  mutation: GlobalConfigMutation,
): Promise<ConfigInfo> {
  return withGlobalConfigChangeLock(async () => {
    const filepath = resolveGlobalConfigFile()
    await ensureParentDirectory(filepath)

    const before = await readConfigTextOrDefault(filepath)
    const current = parseConfigText(before, filepath)
    const next = Info.parse(mutation(current))

    if (!filepath.endsWith(".jsonc")) {
      await writeJsonFile(filepath, next)
    } else {
      const updated = replaceJsoncDocument(before, next)
      parseConfigText(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
    }

    resetGlobalConfigCache()
    await OpenCodeInstance.disposeAll()

    return next
  })
}
