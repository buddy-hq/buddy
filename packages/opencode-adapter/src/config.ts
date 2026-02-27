// Compile-safe bridge to vendored OpenCode config runtime with in-memory overlays.
import { Config } from "opencode/config/config"
import { Instance } from "opencode/project/instance"

type RuntimeConfig = Awaited<ReturnType<typeof Config.get>>

const overlays = new Map<string, Partial<RuntimeConfig>>()
const originalGet = Config.get.bind(Config)

let patched = false

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function mergeConfigValue<T>(base: T, overlay: unknown): T {
  if (overlay === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return overlay as T
  }

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = key in result ? mergeConfigValue(result[key], value) : value
  }
  return result as T
}

function ensurePatched() {
  if (patched) return
  patched = true

  Config.get = async function getWithOverlay() {
    const base = await originalGet()
    const overlay = overlays.get(Instance.directory)
    if (!overlay) return base
    return mergeConfigValue(base, overlay)
  }
}

export function setConfigOverlay(directory: string, overlay: Partial<RuntimeConfig>) {
  ensurePatched()
  overlays.set(directory, overlay)
}

export function clearConfigOverlay(directory: string) {
  overlays.delete(directory)
}

export { Config }
