import { realpathSync } from "node:fs"
import path from "node:path"

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

const EMPTY_AUTHORITATIVE_KEYS: readonly RuntimeConfigOverlayAuthoritativeKey[] = []
const overlaysByDirectory = new Map<string, RuntimeConfigOverlayEntry>()

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
  overlaysByDirectory.set(canonicalizeRuntimeConfigDirectory(directory), {
    overlay,
    authoritativeKeys: options?.authoritativeKeys ?? EMPTY_AUTHORITATIVE_KEYS,
  })
}

export function getRuntimeConfigOverlay(directory: string) {
  return overlaysByDirectory.get(canonicalizeRuntimeConfigDirectory(directory))
}

export function clearRuntimeConfigOverlay(directory: string) {
  overlaysByDirectory.delete(canonicalizeRuntimeConfigDirectory(directory))
}
