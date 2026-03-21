// Compile-safe bridge to vendored OpenCode config runtime with in-memory overlays.
import { Config } from 'opencode/config/config'
import { Instance } from 'opencode/project/instance'
import path from 'node:path'
import { realpathSync } from 'node:fs'

type RuntimeConfig = Awaited<ReturnType<typeof Config.get>>

const overlays = new Map<string, Partial<RuntimeConfig>>()
const originalGet = Config.get.bind(Config)

let patched = false

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergePluginValues(base: unknown, overlay: unknown) {
  if (!Array.isArray(base) || !Array.isArray(overlay)) {
    return overlay
  }

  return Array.from(new Set([...base, ...overlay]))
}

function mergeConfigValue<T>(base: T, overlay: unknown, key?: string): T {
  if (overlay === undefined) return base
  if (key === 'plugin') {
    return mergePluginValues(base, overlay) as T
  }
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return overlay as T
  }

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = key in result ? mergeConfigValue(result[key], value, key) : value
  }
  return result as T
}

function key(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function ensurePatched() {
  if (patched) return
  patched = true

  Config.get = async function getWithOverlay() {
    const base = await originalGet()
    const overlay = overlays.get(key(Instance.directory))
    if (!overlay) return base
    return mergeConfigValue(base, overlay)
  }
}

export function setConfigOverlay(directory: string, overlay: Partial<RuntimeConfig>) {
  ensurePatched()
  overlays.set(key(directory), overlay)
}

export function clearConfigOverlay(directory: string) {
  overlays.delete(key(directory))
}

export { Config }
