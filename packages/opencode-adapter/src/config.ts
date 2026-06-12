import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { ConfigPluginV1 } from "@opencode-ai/core/v1/config/plugin"
import { ConfigProviderV1 } from "@opencode-ai/core/v1/config/provider"
import { ConfigSkillsV1 } from "@opencode-ai/core/v1/config/skills"
import * as OpenCodeConfig from "opencode/config/config"
import * as OpenCodeConfigPlugin from "opencode/config/plugin"
import { ConfigParse as OpenCodeConfigParse } from "opencode/config/parse"
import { ConfigVariable as OpenCodeConfigVariable } from "opencode/config/variable"
import { Effect, Schema } from "effect"
import { makeRuntime } from "opencode/effect/run-service"
import { InstanceRef } from "opencode/effect/instance-ref"
import {
  clearRuntimeConfigOverlay,
  getRuntimeConfigOverlay,
  RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS,
  setRuntimeConfigOverlay,
  type RuntimeConfigOverlayAuthoritativeKey,
  type RuntimeConfigOverlayOptions,
} from "./config-overlay"
import { withCurrentInstance } from "./effect-runtime"

type RuntimeConfig = ConfigV1.Info & {
  plugin_origins?: OpenCodeConfigPlugin.Origin[]
}

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

function applyAuthoritativeRuntimeConfigKeys(
  base: RuntimeConfig,
  keys: readonly RuntimeConfigOverlayAuthoritativeKey[],
): void {
  for (const key of keys) {
    if (key === RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS.mcp) {
      delete base.mcp
    }
  }
}

function runtimeConfigOverlayPluginOrigin(spec: ConfigPluginV1.Spec): OpenCodeConfigPlugin.Origin {
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
      ConfigV1.Info,
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

    const entry = getRuntimeConfigOverlay(instance.directory)
    if (!entry || appliedRuntimeConfigOverlays.has(config)) {
      return config
    }

    const parsedOverlay = yield* parseRuntimeConfigOverlay({
      directory: instance.directory,
      overlay: entry.overlay,
    })

    applyAuthoritativeRuntimeConfigKeys(config, entry.authoritativeKeys)
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

export function setConfigOverlay(
  directory: string,
  overlay: Partial<RuntimeConfig>,
  options?: RuntimeConfigOverlayOptions,
) {
  setRuntimeConfigOverlay(directory, overlay, options)
}

export function clearConfigOverlay(directory: string) {
  clearRuntimeConfigOverlay(directory)
}

export namespace Config {
  export const Info = ConfigV1.Info
  export type Info = ConfigV1.Info

  export const Agent = ConfigAgentV1.Info
  export type Agent = ConfigAgentV1.Info

  export const Skills = ConfigSkillsV1.Info
  export type Skills = ConfigSkillsV1.Info

  export const ModelID = Schema.String
  export type ModelID = Schema.Schema.Type<typeof ModelID>

  export const Provider = ConfigProviderV1.Info
  export type Provider = ConfigProviderV1.Info

  export const Permission = ConfigPermissionV1.Info
  export type Permission = ConfigPermissionV1.Info

  export const PermissionAction = ConfigPermissionV1.Action
  export type PermissionAction = ConfigPermissionV1.Action

  export const PermissionRule = ConfigPermissionV1.Rule
  export type PermissionRule = ConfigPermissionV1.Rule

  export const Mcp = ConfigMCPV1.Info
  export type Mcp = ConfigMCPV1.Info

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
