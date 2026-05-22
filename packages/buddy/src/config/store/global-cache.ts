import fsp from "node:fs/promises"
import { loadConfigFile } from "../contract/document.js"
import { resolveGlobalConfigFile } from "./config-paths.js"
import type { Info } from "./types.js"

type GlobalConfigCacheEntry = {
  fingerprint: string
  promise: Promise<Info>
}

let globalConfigCacheEntry: GlobalConfigCacheEntry | undefined

async function globalConfigFingerprint(filepath: string): Promise<string> {
  try {
    const stats = await fsp.stat(filepath)
    return [filepath, stats.mtimeMs, stats.size].join(":")
  } catch (error) {
    const candidate = error as { code?: string }
    if (candidate.code === "ENOENT") {
      return `${filepath}:missing`
    }
    throw error
  }
}

export async function getCachedGlobalConfig(): Promise<Info> {
  const filepath = resolveGlobalConfigFile()
  const fingerprint = await globalConfigFingerprint(filepath)

  if (!globalConfigCacheEntry || globalConfigCacheEntry.fingerprint !== fingerprint) {
    globalConfigCacheEntry = {
      fingerprint,
      promise: loadConfigFile(filepath),
    }
  }

  return globalConfigCacheEntry.promise
}

export function resetGlobalConfigCache(): void {
  globalConfigCacheEntry = undefined
}
