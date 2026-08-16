import { realpathSync } from "node:fs"
import path from "node:path"
import type { ConfigV1 } from "@opencode-ai/core/v1/config/config"

export const RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS = {
  mcp: "mcp",
} as const

export type RuntimeConfigOverlayAuthoritativeKey =
  (typeof RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS)[keyof typeof RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS]

export type RuntimeConfigOverlayOptions = {
  authoritativeKeys?: readonly RuntimeConfigOverlayAuthoritativeKey[]
}

export type TRuntimeConfigOverlay = Partial<ConfigV1.Info>

export type RuntimeConfigOverlayEntry = {
  overlay: TRuntimeConfigOverlay
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
  overlay: TRuntimeConfigOverlay,
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
