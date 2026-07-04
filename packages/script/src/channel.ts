import { OPENCODE_ENV } from "./storage-env.ts"

export const BUDDY_CHANNEL_ENV = "BUDDY_CHANNEL" as const
export const BUDDY_RELEASE_CHANNELS = ["dev", "beta", "prod"] as const
export const BUDDY_DEFAULT_DEV_CHANNEL = "dev" as const
export const BUDDY_PACKAGED_FALLBACK_CHANNEL = "prod" as const
export const OPENCODE_CHANNEL_DEFINE = OPENCODE_ENV.CHANNEL

export type BuddyReleaseChannel = (typeof BUDDY_RELEASE_CHANNELS)[number]

const BUDDY_RELEASE_CHANNEL_SET: ReadonlySet<string> = new Set(BUDDY_RELEASE_CHANNELS)
const OPENCODE_DEV_CHANNEL = "dev" as const
const OPENCODE_PROD_CHANNEL = "prod" as const
const OPENCODE_DB_FILENAME = "opencode.db" as const
const OPENCODE_DB_FILE_EXTENSION = ".db" as const
const OPENCODE_CHANNEL_DB_UNSAFE_CHARACTERS = /[^a-zA-Z0-9._-]/g
const OPENCODE_STABLE_DATABASE_CHANNELS: ReadonlySet<string> = new Set([
  "latest",
  "beta",
  OPENCODE_PROD_CHANNEL,
])

export type OpenCodeChannel = typeof OPENCODE_DEV_CHANNEL | typeof OPENCODE_PROD_CHANNEL

export function isBuddyReleaseChannel(value: string | undefined): value is BuddyReleaseChannel {
  return value !== undefined && BUDDY_RELEASE_CHANNEL_SET.has(value)
}

export function resolveBuddyReleaseChannel(input: {
  fallback?: BuddyReleaseChannel
  raw: string | undefined
}): BuddyReleaseChannel {
  return isBuddyReleaseChannel(input.raw) ? input.raw : (input.fallback ?? BUDDY_DEFAULT_DEV_CHANNEL)
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

export function resolveOpenCodeDatabaseFilename(channel: string): string {
  if (OPENCODE_STABLE_DATABASE_CHANNELS.has(channel)) {
    return OPENCODE_DB_FILENAME
  }

  return `opencode-${channel.replace(
    OPENCODE_CHANNEL_DB_UNSAFE_CHARACTERS,
    "-",
  )}${OPENCODE_DB_FILE_EXTENSION}`
}

export function resolveOpenCodeDatabaseFilenameForBuddyChannel(
  channel: BuddyReleaseChannel,
): string {
  return resolveOpenCodeDatabaseFilename(resolveOpenCodeChannelForBuddyChannel(channel))
}
