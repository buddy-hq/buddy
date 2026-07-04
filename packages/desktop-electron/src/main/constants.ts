import { app } from "electron"
import {
  BUDDY_PACKAGED_FALLBACK_CHANNEL,
  type BuddyReleaseChannel,
  isBuddyReleaseChannel,
} from "@buddy/script/channel"

export type ReleaseChannel = BuddyReleaseChannel

const rawChannel = import.meta.env.BUDDY_CHANNEL
const CHANNEL_NAME_HINTS: Record<ReleaseChannel, string> = {
  dev: "dev",
  beta: "beta",
  prod: "buddy",
}

function resolvePackagedChannelFallback(): ReleaseChannel {
  const appName = app.getName().toLowerCase()

  if (appName.includes(CHANNEL_NAME_HINTS.beta)) {
    return "beta"
  }

  if (appName.includes(CHANNEL_NAME_HINTS.dev)) {
    return "dev"
  }

  if (appName.includes(CHANNEL_NAME_HINTS.prod)) {
    return "prod"
  }

  return BUDDY_PACKAGED_FALLBACK_CHANNEL
}

export const CHANNEL: ReleaseChannel = isBuddyReleaseChannel(rawChannel)
  ? rawChannel
  : app.isPackaged
    ? resolvePackagedChannelFallback()
    : "dev"

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
export const BACKEND_SERVER_USERNAME = "buddy"
export const SETTINGS_STORE = "buddy.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_ENABLED_KEY = "wslEnabled"
export const API_HEALTH_PATH = "/api/healthz"
export const API_VENDOR_HEALTH_PATH = "/api/health"
export const LOOPBACK_HOSTNAME = "127.0.0.1"
export const BACKEND_HEALTH_TIMEOUT_MS = 30_000
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"

export function resolveAppName(packaged: boolean) {
  const devInstanceName = process.env.BUDDY_DEV_INSTANCE_NAME?.trim()
  if (!packaged && devInstanceName) return `${APP_NAMES.dev} — ${devInstanceName}`
  if (!packaged) return APP_NAMES.dev
  return APP_NAMES[CHANNEL]
}

export function resolveAppId(packaged: boolean) {
  if (!packaged) return APP_IDS.dev
  return APP_IDS[CHANNEL]
}
