import { realpathSync } from "node:fs"
import path from "node:path"

const RUNTIME_CONFIG_OVERLAY_STATE_KEY = Symbol.for("buddy.runtimeConfigOverlayState")

type RuntimeConfigOverlayState = {
  overlaysByDirectory: Map<string, unknown>
}

function getRuntimeConfigOverlayState(): RuntimeConfigOverlayState {
  const globalObject = globalThis as typeof globalThis & {
    [RUNTIME_CONFIG_OVERLAY_STATE_KEY]?: RuntimeConfigOverlayState
  }

  if (!globalObject[RUNTIME_CONFIG_OVERLAY_STATE_KEY]) {
    globalObject[RUNTIME_CONFIG_OVERLAY_STATE_KEY] = {
      overlaysByDirectory: new Map<string, unknown>(),
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

export function setRuntimeConfigOverlay(directory: string, overlay: unknown) {
  const state = getRuntimeConfigOverlayState()
  state.overlaysByDirectory.set(canonicalizeRuntimeConfigDirectory(directory), overlay)
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
