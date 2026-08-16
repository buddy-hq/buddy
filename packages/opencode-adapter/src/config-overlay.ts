import { realpathSync } from "node:fs"
import path from "node:path"

const RUNTIME_CONFIG_OVERLAY_STATE_KEY = Symbol.for("buddy.runtimeConfigOverlayState")

export const RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS = {
  mcp: "mcp",
} as const

export type RuntimeConfigOverlayAuthoritativeKey =
  (typeof RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS)[keyof typeof RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS]

export type RuntimeConfigOverlayOptions = {
  authoritativeKeys?: readonly RuntimeConfigOverlayAuthoritativeKey[]
}

export type RuntimeConfigOverlayEntry = {
  overlay: unknown
  authoritativeKeys: readonly RuntimeConfigOverlayAuthoritativeKey[]
}

type RuntimeConfigOverlayState = {
  overlaysByDirectory: Map<string, RuntimeConfigOverlayEntry>
}

const EMPTY_AUTHORITATIVE_KEYS: readonly RuntimeConfigOverlayAuthoritativeKey[] = []

function getRuntimeConfigOverlayState(): RuntimeConfigOverlayState {
  // SAFETY: This symbol-keyed global slot is exclusively owned by the config-overlay module.
  const globalObject = globalThis as typeof globalThis & {
    [RUNTIME_CONFIG_OVERLAY_STATE_KEY]?: RuntimeConfigOverlayState
  }

  if (!globalObject[RUNTIME_CONFIG_OVERLAY_STATE_KEY]) {
    globalObject[RUNTIME_CONFIG_OVERLAY_STATE_KEY] = {
      overlaysByDirectory: new Map<string, RuntimeConfigOverlayEntry>(),
    }
  }

  return globalObject[RUNTIME_CONFIG_OVERLAY_STATE_KEY]
}

export function canonicalizeRuntimeConfigDirectory(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

export function setRuntimeConfigOverlay(
  directory: string,
  overlay: unknown,
  options?: RuntimeConfigOverlayOptions,
) {
  const state = getRuntimeConfigOverlayState()
  state.overlaysByDirectory.set(canonicalizeRuntimeConfigDirectory(directory), {
    overlay,
    authoritativeKeys: options?.authoritativeKeys ?? EMPTY_AUTHORITATIVE_KEYS,
  })
}

export function getRuntimeConfigOverlay(directory: string) {
  return getRuntimeConfigOverlayState().overlaysByDirectory.get(
    canonicalizeRuntimeConfigDirectory(directory),
  )
}

export function clearRuntimeConfigOverlay(directory: string) {
  getRuntimeConfigOverlayState().overlaysByDirectory.delete(
    canonicalizeRuntimeConfigDirectory(directory),
  )
}
