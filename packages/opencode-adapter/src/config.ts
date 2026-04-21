import { realpathSync } from "node:fs"
import path from "node:path"
import * as OpenCodeConfigAgent from "opencode/config/agent"
import * as OpenCodeConfig from "opencode/config/config"
import * as OpenCodeConfigMCP from "opencode/config/mcp"
import * as OpenCodeConfigModelID from "opencode/config/model-id"
import * as OpenCodeConfigPermission from "opencode/config/permission"
import * as OpenCodeConfigProvider from "opencode/config/provider"
import * as OpenCodeConfigSkills from "opencode/config/skills"
import { makeRuntime } from "opencode/effect/run-service"
import { Instance } from "opencode/project/instance"

type RuntimeConfig = OpenCodeConfig.Info

const runtime = makeRuntime(OpenCodeConfig.Service, OpenCodeConfig.defaultLayer)
const overlays = new Map<string, Partial<RuntimeConfig>>()

const originalProvide = Instance.provide.bind(Instance)
const originalReload = Instance.reload.bind(Instance)

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

function mergeConfigValue<T>(base: T, overlay: unknown, field?: string): T {
  if (overlay === undefined) return base
  if (field === "plugin") {
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

  const provideWithOverlay: typeof Instance.provide = async (input) => {
    return withOverlayEnv(input.directory, () => originalProvide(input))
  }

  const reloadWithOverlay: typeof Instance.reload = async (input) => {
    return withOverlayEnv(input.directory, () => originalReload(input))
  }

  Instance.provide = provideWithOverlay
  Instance.reload = reloadWithOverlay
}

export function setConfigOverlay(directory: string, overlay: Partial<RuntimeConfig>) {
  ensurePatched()
  overlays.set(key(directory), overlay)
}

export function clearConfigOverlay(directory: string) {
  overlays.delete(key(directory))
}

export namespace Config {
  export const Info = OpenCodeConfig.Info
  export type Info = OpenCodeConfig.Info

  export const Agent = OpenCodeConfigAgent.Info
  export type Agent = OpenCodeConfigAgent.Info

  export const Skills = OpenCodeConfigSkills.Info.zod
  export type Skills = OpenCodeConfigSkills.Info

  export const ModelID = OpenCodeConfigModelID.ConfigModelID.zod
  export type ModelID = OpenCodeConfigModelID.ConfigModelID

  export const Provider = OpenCodeConfigProvider.Info.zod
  export type Provider = OpenCodeConfigProvider.Info

  export const Permission = OpenCodeConfigPermission.Info
  export type Permission = OpenCodeConfigPermission.Info

  export const PermissionAction = OpenCodeConfigPermission.Action.zod
  export type PermissionAction = OpenCodeConfigPermission.Action

  export const PermissionRule = OpenCodeConfigPermission.Rule.zod
  export type PermissionRule = OpenCodeConfigPermission.Rule

  export const Mcp = OpenCodeConfigMCP.Info.zod
  export type Mcp = OpenCodeConfigMCP.Info

  export async function get() {
    ensurePatched()
    const config = await runtime.runPromise((svc) => svc.get())
    const overlay = overlays.get(key(Instance.directory))
    if (!overlay) return config
    return mergeConfigValue(config, overlay)
  }

  export async function getGlobal() {
    return runtime.runPromise((svc) => svc.getGlobal())
  }

  export async function directories() {
    ensurePatched()
    return runtime.runPromise((svc) => svc.directories())
  }

  export async function waitForDependencies() {
    return runtime.runPromise((svc) => svc.waitForDependencies())
  }
}
