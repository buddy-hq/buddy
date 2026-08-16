import type { BuddyReleaseChannel } from "@buddy/script/channel"
import {
  parseTJsonObject,
  parseTNonEmptyString,
  parseTNumber,
  parseWithSchema,
} from "../shared/parse-external"
import { z } from "zod"

const RECOVERY_POLICY_SCHEMA_VERSION = 1

type TReleaseChannel = BuddyReleaseChannel
type TRecoveryMode = "roll-forward" | "downgrade"
type TRecoveryPlatform = "darwin" | "win32"

type TRecoveryPolicyEntry = {
  blockVersion: boolean
  mode: TRecoveryMode
  platforms: TRecoveryPlatform[]
  reason?: string
  rollbackSafe: boolean
  targetVersion: string
  version: string
}

type TRecoveryPolicy = {
  badVersions: TRecoveryPolicyEntry[]
  schema: typeof RECOVERY_POLICY_SCHEMA_VERSION
}

type TRecoveryTarget = TRecoveryPolicyEntry

const recoveryModeSchema = z.enum(["roll-forward", "downgrade"])
const recoveryPlatformSchema = z.enum(["darwin", "win32"])

function parseTRecoveryMode<TValue>(value: TValue): TRecoveryMode | undefined {
  return parseWithSchema(recoveryModeSchema, value)
}

function parseTRecoveryPlatform<TValue>(value: TValue): TRecoveryPlatform | undefined {
  return parseWithSchema(recoveryPlatformSchema, value)
}

function parseRecoveryPolicy(content: string): TRecoveryPolicy {
  const parsed = parseTJsonObject(JSON.parse(content))
  if (parsed === undefined) {
    throw new Error("Recovery policy must be an object")
  }

  if (parseTNumber(parsed.schema) !== RECOVERY_POLICY_SCHEMA_VERSION) {
    throw new Error("Unsupported recovery policy schema")
  }

  if (!Array.isArray(parsed.badVersions)) {
    throw new Error("Recovery policy badVersions must be an array")
  }

  const badVersions = parsed.badVersions.map(parseRecoveryPolicyEntry)
  return {
    badVersions,
    schema: RECOVERY_POLICY_SCHEMA_VERSION,
  }
}

function parseRecoveryPolicyEntry<TValue>(value: TValue): TRecoveryPolicyEntry {
  const record = parseTJsonObject(value)
  if (record === undefined) {
    throw new Error("Recovery policy entry must be an object")
  }

  const version = parseTNonEmptyString(record.version)
  if (version === undefined) {
    throw new Error("Recovery policy entry requires version")
  }

  const targetVersion = parseTNonEmptyString(record.targetVersion)
  if (targetVersion === undefined) {
    throw new Error("Recovery policy entry requires targetVersion")
  }

  const mode = record.mode === undefined ? "roll-forward" : parseTRecoveryMode(record.mode)
  if (mode === undefined) {
    throw new Error("Recovery policy entry has invalid mode")
  }

  const rollbackSafe = record.rollbackSafe === true
  const blockVersion = record.blockVersion !== false
  const platforms = parseRecoveryPlatforms(record.platforms)
  const reason = parseTNonEmptyString(record.reason)

  return Object.assign(
    {
      blockVersion,
      mode,
      platforms,
      rollbackSafe,
      targetVersion,
      version,
    },
    reason ? { reason } : undefined,
  )
}

function parseRecoveryPlatforms<TValue>(value: TValue): TRecoveryPlatform[] {
  if (value === undefined) {
    return ["darwin", "win32"]
  }

  if (!Array.isArray(value)) {
    throw new Error("Recovery policy platforms must be an array")
  }

  const platforms: TRecoveryPlatform[] = []
  for (const entry of value) {
    const platform = parseTRecoveryPlatform(entry)
    if (platform === undefined) {
      throw new Error("Recovery policy platforms contains unsupported platform")
    }
    platforms.push(platform)
  }

  return [...new Set(platforms)]
}

function findRecoveryTarget(input: {
  channel: TReleaseChannel
  currentVersion: string
  platform: NodeJS.Platform
  policy: TRecoveryPolicy
}): TRecoveryTarget | undefined {
  return input.policy.badVersions.find(
    (entry) =>
      entry.version === input.currentVersion &&
      isCurrentPlatformAllowed(entry.platforms, input.platform) &&
      isChannelEligible(input.channel),
  )
}

function isCurrentPlatformAllowed(
  platforms: TRecoveryPlatform[],
  platform: NodeJS.Platform,
): boolean {
  const currentPlatform = parseTRecoveryPlatform(platform)
  return currentPlatform !== undefined && platforms.includes(currentPlatform)
}

function validateRecoveryTarget(
  target: TRecoveryTarget,
  currentVersion: string,
): string | undefined {
  if (target.targetVersion === currentVersion) {
    return "Recovery target matches the current broken version"
  }

  if (target.mode === "downgrade" && !target.rollbackSafe) {
    return "Recovery policy requested a downgrade without rollbackSafe=true"
  }

  if (target.mode === "roll-forward" && compareVersions(target.targetVersion, currentVersion) < 0) {
    return "Recovery policy requested an older roll-forward target"
  }

  return undefined
}

function isChannelEligible(channel: TReleaseChannel): boolean {
  return channel === "prod" || channel === "beta"
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart < rightPart) return -1
    if (leftPart > rightPart) return 1
  }

  return 0
}

function versionParts(version: string): number[] {
  return version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

export {
  compareVersions,
  findRecoveryTarget,
  parseRecoveryPolicy,
  validateRecoveryTarget,
  type TRecoveryPolicy as RecoveryPolicy,
  type TRecoveryTarget as RecoveryTarget,
}
