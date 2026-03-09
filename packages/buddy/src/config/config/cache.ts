import { loadConfigFile } from "../document.js"
import { resolveGlobalConfigFile } from "./paths.js"
import type { Info } from "./types.js"

let globalConfigPromise: Promise<Info> | undefined

export async function getCachedGlobalConfig(): Promise<Info> {
  if (!globalConfigPromise) {
    globalConfigPromise = loadConfigFile(resolveGlobalConfigFile())
  }
  return globalConfigPromise
}

export function resetGlobalConfigCache(): void {
  globalConfigPromise = undefined
}
