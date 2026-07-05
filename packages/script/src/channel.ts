import { BUDDY_OPENCODE_DB_FILENAME, OPENCODE_ENV } from "./storage-env.ts"

export const BUDDY_CHANNEL_ENV = "BUDDY_CHANNEL" as const
export const BUDDY_RELEASE_CHANNELS = ["dev", "beta", "prod"] as const
export const BUDDY_DEFAULT_DEV_CHANNEL = "dev" as const
export const BUDDY_PACKAGED_FALLBACK_CHANNEL = "prod" as const
export const OPENCODE_CHANNEL_DEFINE = OPENCODE_ENV.CHANNEL

export type BuddyReleaseChannel = (typeof BUDDY_RELEASE_CHANNELS)[number]

const BUDDY_RELEASE_CHANNEL_SET: ReadonlySet<string> = new Set(BUDDY_RELEASE_CHANNELS)
const OPENCODE_DEV_CHANNEL = "dev" as const
const OPENCODE_PROD_CHANNEL = "prod" as const
export const OPENCODE_DB_FILENAME = BUDDY_OPENCODE_DB_FILENAME

export type OpenCodeChannel = typeof OPENCODE_DEV_CHANNEL | typeof OPENCODE_PROD_CHANNEL

export function isBuddyReleaseChannel(value: string | undefined): value is BuddyReleaseChannel {
  return value !== undefined && BUDDY_RELEASE_CHANNEL_SET.has(value)
}

export function resolveBuddyReleaseChannel(input: {
  fallback?: BuddyReleaseChannel
  raw: string | undefined
}): BuddyReleaseChannel {
  return isBuddyReleaseChannel(input.raw)
    ? input.raw
    : (input.fallback ?? BUDDY_DEFAULT_DEV_CHANNEL)
}

export function readBuddyReleaseChannel(
  environment: Record<string, string | undefined> = process.env,
  fallback: BuddyReleaseChannel = BUDDY_DEFAULT_DEV_CHANNEL,
): BuddyReleaseChannel {
  return resolveBuddyReleaseChannel({
    fallback,
    raw: environment[BUDDY_CHANNEL_ENV]?.trim(),
  })
}

export function resolveOpenCodeChannelForBuddyChannel(
  channel: BuddyReleaseChannel,
): OpenCodeChannel {
  return channel === BUDDY_DEFAULT_DEV_CHANNEL ? OPENCODE_DEV_CHANNEL : OPENCODE_PROD_CHANNEL
}
