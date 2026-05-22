import fsp from "node:fs/promises"
import path from "node:path"
import { mergeDeep } from "remeda"
import { piRuntime } from "../../pi-backend/runtime"
import { syncGlobalPiMcpConfig, syncProjectPiMcpConfig } from "../../pi-backend/mcp-runtime"
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

export async function updateProjectConfig(directory: string, config: ConfigInfo): Promise<void> {
  const { configDirectory } = await resolveProjectConfigContext(directory)
  const filepath = resolveProjectConfigFile(configDirectory)
  await ensureParentDirectory(filepath)

  const before = await readConfigTextOrDefault(filepath)
  if (!filepath.endsWith(".jsonc")) {
    await writeJsonFile(filepath, config)
    await syncProjectPiMcpConfig(directory)
    piRuntime.disposeAll()
    return
  }

  const updated = replaceJsoncDocument(before, config)
  parseConfigText(updated, filepath)
  await fsp.writeFile(filepath, updated, "utf8")
  await syncProjectPiMcpConfig(directory)
  piRuntime.disposeAll()
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
    await syncProjectPiMcpConfig(directory)
    piRuntime.disposeAll()
    return
  }

  const updated = patchJsoncDocument(before, {
    mcp: {
      [name]: mcp,
    },
  })
  parseConfigText(updated, filepath)
  await fsp.writeFile(filepath, updated, "utf8")
  await syncProjectPiMcpConfig(directory)
  piRuntime.disposeAll()
}

export async function updateGlobalConfig(config: ConfigInfo): Promise<ConfigInfo> {
  const filepath = resolveGlobalConfigFile()
  await ensureParentDirectory(filepath)

  const before = await readConfigTextOrDefault(filepath)
  const next = await (async () => {
    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfigText(before, filepath)
      const merged = mergeDeep(existing, config)
      await writeJsonFile(filepath, merged)
      return merged
    }

    const updated = patchJsoncDocument(before, config)
    const merged = parseConfigText(updated, filepath)
    await fsp.writeFile(filepath, updated, "utf8")
    return merged
  })()

  resetGlobalConfigCache()
  await syncGlobalPiMcpConfig()
  piRuntime.disposeAll()

  return next
}
