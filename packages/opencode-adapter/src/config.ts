import * as OpenCodeConfigAgent from "opencode/config/agent"
import * as OpenCodeConfig from "opencode/config/config"
import * as OpenCodeConfigMCP from "opencode/config/mcp"
import * as OpenCodeConfigModelID from "opencode/config/model-id"
import * as OpenCodeConfigPermission from "opencode/config/permission"
import * as OpenCodeConfigPlugin from "opencode/config/plugin"
import * as OpenCodeConfigProvider from "opencode/config/provider"
import * as OpenCodeConfigSkills from "opencode/config/skills"
import { ConfigParse as OpenCodeConfigParse } from "opencode/config/parse"
import { ConfigVariable as OpenCodeConfigVariable } from "opencode/config/variable"
import { Effect, Schema } from "effect"
import { makeRuntime } from "opencode/effect/run-service"
import { InstanceRef } from "opencode/effect/instance-ref"
import {
  clearRuntimeConfigOverlay,
  getRuntimeConfigOverlay,
  setRuntimeConfigOverlay,
} from "./config-overlay"
import { withCurrentInstance } from "./effect-runtime"

type RuntimeConfig = OpenCodeConfig.Info

const BUDDY_RUNTIME_CONFIG_OVERLAY_SOURCE = "BUDDY_RUNTIME_CONFIG_OVERLAY"
const runtime = makeRuntime(OpenCodeConfig.Service, OpenCodeConfig.defaultLayer)
const patchedServices = new WeakSet<OpenCodeConfig.Interface>()
const appliedRuntimeConfigOverlays = new WeakSet<RuntimeConfig>()
let patchPromise: Promise<void> | undefined

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function mergeRuntimeConfigValueInto(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return base
  if (!isPlainObject(overlay)) {
    return overlay
  }

  const target: Record<string, unknown> = isPlainObject(base) ? base : {}
  for (const [key, value] of Object.entries(overlay)) {
    target[key] = mergeRuntimeConfigValueInto(target[key], value)
  }
  return target
}

function applyRuntimeConfigOverlay(base: RuntimeConfig, overlay: Partial<RuntimeConfig>): void {
  const baseInstructions = base.instructions ? [...base.instructions] : undefined
  const basePluginOrigins = base.plugin_origins ? [...base.plugin_origins] : []

  mergeRuntimeConfigValueInto(base, overlay)

  if (baseInstructions && overlay.instructions) {
    base.instructions = Array.from(new Set([...baseInstructions, ...overlay.instructions]))
  }
  if (overlay.plugin?.length) {
    const origins = OpenCodeConfigPlugin.deduplicatePluginOrigins([
      ...basePluginOrigins,
      ...overlay.plugin.map(runtimeConfigOverlayPluginOrigin),
    ])
    base.plugin = origins.map((origin) => origin.spec)
    base.plugin_origins = origins
  }
}

function runtimeConfigOverlayPluginOrigin(
  spec: OpenCodeConfigPlugin.Spec,
): OpenCodeConfigPlugin.Origin {
  return {
    spec,
    source: BUDDY_RUNTIME_CONFIG_OVERLAY_SOURCE,
    scope: "local",
  }
}

function normalizeLoadedConfig(data: unknown) {
  if (!isPlainObject(data)) return data
  const copy = { ...data }
  const hasDeprecatedTuiKeys = "theme" in copy || "keybinds" in copy || "tui" in copy
  if (!hasDeprecatedTuiKeys) return copy
  delete copy.theme
  delete copy.keybinds
  delete copy.tui
  return copy
}

const parseRuntimeConfigOverlay = Effect.fn("BuddyConfig.parseRuntimeConfigOverlay")(
  function* (input: { directory: string; overlay: unknown }) {
    const text = JSON.stringify(input.overlay)
    const expanded = yield* Effect.promise(() =>
      OpenCodeConfigVariable.substitute({
        text,
        type: "virtual",
        dir: input.directory,
        source: BUDDY_RUNTIME_CONFIG_OVERLAY_SOURCE,
      }),
    )
    const parsed = OpenCodeConfigParse.jsonc(expanded, BUDDY_RUNTIME_CONFIG_OVERLAY_SOURCE)
    return OpenCodeConfigParse.schema(
      OpenCodeConfig.Info,
      normalizeLoadedConfig(parsed),
      BUDDY_RUNTIME_CONFIG_OVERLAY_SOURCE,
    )
  },
)

function ensurePatched(service: OpenCodeConfig.Interface) {
  if (patchedServices.has(service)) {
    return
  }
  patchedServices.add(service)

  const originalGet = service.get.bind(service)

  const get: OpenCodeConfig.Interface["get"] = Effect.fn("BuddyConfig.get")(function* () {
    const config = yield* originalGet()
    const instance = yield* InstanceRef
    if (!instance) {
      return config
    }

    const overlay = getRuntimeConfigOverlay(instance.directory)
    if (!overlay || appliedRuntimeConfigOverlays.has(config)) {
      return config
    }

    const parsedOverlay = yield* parseRuntimeConfigOverlay({
      directory: instance.directory,
      overlay,
    })

    applyRuntimeConfigOverlay(config, parsedOverlay)
    appliedRuntimeConfigOverlays.add(config)
    return config
  })

  Object.defineProperties(service, {
    get: { value: get },
  })
}

export async function ensureConfigServicePatched() {
  patchPromise ??= runtime
    .runPromise((svc) => Effect.sync(() => ensurePatched(svc)))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })
  await patchPromise
}

export async function withConfigOverlay<T>(_directory: string, fn: () => Promise<T>): Promise<T> {
  await ensureConfigServicePatched()
  return fn()
}

export function setConfigOverlay(directory: string, overlay: Partial<RuntimeConfig>) {
  setRuntimeConfigOverlay(directory, overlay)
}

export function clearConfigOverlay(directory: string) {
  clearRuntimeConfigOverlay(directory)
}

export namespace Config {
  export const Info = OpenCodeConfig.Info
  export type Info = Schema.Schema.Type<typeof OpenCodeConfig.Info>

  export const Agent = OpenCodeConfigAgent.Info
  export type Agent = Schema.Schema.Type<typeof OpenCodeConfigAgent.Info>

  export const Skills = OpenCodeConfigSkills.Info
  export type Skills = Schema.Schema.Type<typeof OpenCodeConfigSkills.Info>

  export const ModelID = OpenCodeConfigModelID.ConfigModelID
  export type ModelID = Schema.Schema.Type<typeof OpenCodeConfigModelID.ConfigModelID>

  export const Provider = OpenCodeConfigProvider.Info
  export type Provider = Schema.Schema.Type<typeof OpenCodeConfigProvider.Info>

  export const Permission = OpenCodeConfigPermission.Info
  export type Permission = Schema.Schema.Type<typeof OpenCodeConfigPermission.Info>

  export const PermissionAction = OpenCodeConfigPermission.Action
  export type PermissionAction = Schema.Schema.Type<typeof OpenCodeConfigPermission.Action>

  export const PermissionRule = OpenCodeConfigPermission.Rule
  export type PermissionRule = Schema.Schema.Type<typeof OpenCodeConfigPermission.Rule>

  export const Mcp = OpenCodeConfigMCP.Info
  export type Mcp = Schema.Schema.Type<typeof OpenCodeConfigMCP.Info>

  export async function get() {
    await ensureConfigServicePatched()
    return runtime.runPromise((svc) => withCurrentInstance(svc.get()))
  }

  export async function getGlobal() {
    return runtime.runPromise((svc) => svc.getGlobal())
  }

  export async function directories() {
    await ensureConfigServicePatched()
    return runtime.runPromise((svc) => withCurrentInstance(svc.directories()))
  }

  export async function waitForDependencies() {
    await ensureConfigServicePatched()
    return runtime.runPromise((svc) => withCurrentInstance(svc.waitForDependencies()))
  }
}
