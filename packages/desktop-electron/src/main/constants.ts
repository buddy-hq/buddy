import { join } from "node:path"
import { app } from "electron"
import { BUDDY_BRANDING } from "@buddy/script/branding"
import { resolveBuddyDistribution } from "@buddy/script/distribution"
import {
  BUDDY_PACKAGED_FALLBACK_CHANNEL,
  type BuddyReleaseChannel,
  isBuddyReleaseChannel,
} from "@buddy/script/channel"
import {
  BUDDY_DEV_APP_NAME,
  BUDDY_DEV_INSTANCE_NAME_ENV,
  BUDDY_DEV_USER_DATA_DIR_ENV,
  formatBuddyDevAppName,
} from "../shared/dev-app-name"

export type ReleaseChannel = BuddyReleaseChannel

const rawChannel = import.meta.env.BUDDY_CHANNEL
const CHANNEL_NAME_HINTS = {
  dev: "dev",
  beta: "beta",
  prod: "buddy",
} satisfies Record<ReleaseChannel, string>

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

const distribution = resolveBuddyDistribution(CHANNEL)

/** Product label used by menus and dialogs, retaining Buddy's development copy. */
export const APP_PRODUCT_NAME = distribution?.productName ?? BUDDY_BRANDING.productName
export const APP_PROTOCOL = distribution?.protocol ?? BUDDY_BRANDING.appProtocol
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
  const devInstanceName = process.env[BUDDY_DEV_INSTANCE_NAME_ENV]?.trim()
  if (!packaged) return formatBuddyDevAppName(devInstanceName)
  return distribution?.productName ?? BUDDY_DEV_APP_NAME
}

export function resolveAppId(packaged: boolean) {
  if (!packaged) return "ai.buddy.desktop.dev"
  return distribution?.appId ?? "ai.buddy.desktop.dev"
}

export function resolveUserDataPath(packaged: boolean, appDataPath: string) {
  const devUserDataPath = packaged ? undefined : process.env[BUDDY_DEV_USER_DATA_DIR_ENV]?.trim()
  return devUserDataPath || join(appDataPath, resolveAppId(packaged))
}
