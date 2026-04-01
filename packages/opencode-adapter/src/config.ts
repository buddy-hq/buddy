// Compile-safe bridge to vendored OpenCode config runtime with in-memory overlays.
import { Config } from "opencode/config/config"
import { Instance } from "opencode/project/instance"
import path from "node:path"
import { realpathSync } from "node:fs"

type RuntimeConfig = Awaited<ReturnType<typeof Config.get>>

const overlays = new Map<string, Partial<RuntimeConfig>>()
const originalGet = Config.get.bind(Config)
const originalProvide = Instance.provide.bind(Instance)
const originalReload = Instance.reload.bind(Instance)
type InstanceProvideInput = Parameters<typeof originalProvide>[0]
type InstanceReloadInput = Parameters<typeof originalReload>[0]

let patched = false

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function mergePluginValues(base: unknown, overlay: unknown) {
  if (!Array.isArray(base) || !Array.isArray(overlay)) {
    return overlay
  }

  return Array.from(new Set([...base, ...overlay]))
}

function mergeConfigValue<T>(base: T, overlay: unknown, key?: string): T {
  if (overlay === undefined) return base
  if (key === "plugin") {
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

async function withOverlayEnv<T>(directory: string, fn: () => Promise<T>): Promise<T> {
  const overlay = overlays.get(key(directory))
  if (!overlay) {
    return fn()
  }

  const previous = process.env.OPENCODE_CONFIG_CONTENT
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(overlay)
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.OPENCODE_CONFIG_CONTENT
    } else {
      process.env.OPENCODE_CONFIG_CONTENT = previous
    }
  }
}

function ensurePatched() {
  if (patched) return
  patched = true

  Instance.provide = async function provideWithOverlay<R>(
    input: InstanceProvideInput & { fn: () => R },
  ): Promise<R> {
    return withOverlayEnv(input.directory, () => originalProvide(input))
  }

  Instance.reload = async function reloadWithOverlay(input: InstanceReloadInput) {
    return withOverlayEnv(input.directory, () => originalReload(input))
  }

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
