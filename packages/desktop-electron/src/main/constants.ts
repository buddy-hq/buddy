import { app } from "electron"

export type ReleaseChannel = "dev" | "beta" | "prod"

const rawChannel = import.meta.env.BUDDY_CHANNEL

export const CHANNEL: ReleaseChannel =
  rawChannel === "dev" || rawChannel === "beta" || rawChannel === "prod" ? rawChannel : "dev"

const APP_NAMES: Record<ReleaseChannel, string> = {
  dev: "Buddy Dev",
  beta: "Buddy Beta",
  prod: "Buddy",
}

const APP_IDS: Record<ReleaseChannel, string> = {
  dev: "ai.buddy.desktop.dev",
  beta: "ai.buddy.desktop.beta",
  prod: "ai.buddy.desktop",
}

export const APP_PROTOCOL = "buddy"
export const SIDECAR_BINARY_NAME = "buddy-backend"
export const SIDECAR_USERNAME = "buddy"
export const SETTINGS_STORE = "buddy.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_ENABLED_KEY = "wslEnabled"
export const API_HEALTH_PATH = "/api/health"
export const LOOPBACK_HOSTNAME = "127.0.0.1"
export const SIDECAR_HEALTH_TIMEOUT_MS = 30_000
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"

export function resolveAppName(packaged: boolean) {
  if (!packaged) return APP_NAMES.dev
  return APP_NAMES[CHANNEL]
}

export function resolveAppId(packaged: boolean) {
  if (!packaged) return APP_IDS.dev
  return APP_IDS[CHANNEL]
}
