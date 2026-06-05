const RECOVERY_POLICY_SCHEMA_VERSION = 1

type ReleaseChannel = "dev" | "beta" | "prod"
type RecoveryMode = "roll-forward" | "downgrade"
type RecoveryPlatform = "darwin" | "win32"

type RecoveryPolicyEntry = {
  blockVersion: boolean
  mode: RecoveryMode
  platforms: RecoveryPlatform[]
  reason?: string
  rollbackSafe: boolean
  targetVersion: string
  version: string
}

type RecoveryPolicy = {
  badVersions: RecoveryPolicyEntry[]
  schema: typeof RECOVERY_POLICY_SCHEMA_VERSION
}

type RecoveryTarget = RecoveryPolicyEntry

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isRecoveryMode(value: unknown): value is RecoveryMode {
  return value === "roll-forward" || value === "downgrade"
}

function isRecoveryPlatform(value: unknown): value is RecoveryPlatform {
  return value === "darwin" || value === "win32"
}

function parseRecoveryPolicy(content: string): RecoveryPolicy {
  const parsed: unknown = JSON.parse(content)
  if (!isRecord(parsed)) {
    throw new Error("Recovery policy must be an object")
  }

  if (parsed.schema !== RECOVERY_POLICY_SCHEMA_VERSION) {
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

function parseRecoveryPolicyEntry(value: unknown): RecoveryPolicyEntry {
  if (!isRecord(value)) {
    throw new Error("Recovery policy entry must be an object")
  }

  if (typeof value.version !== "string" || value.version.length === 0) {
    throw new Error("Recovery policy entry requires version")
  }

  if (typeof value.targetVersion !== "string" || value.targetVersion.length === 0) {
    throw new Error("Recovery policy entry requires targetVersion")
  }

  const mode = value.mode === undefined ? "roll-forward" : value.mode
  if (!isRecoveryMode(mode)) {
    throw new Error("Recovery policy entry has invalid mode")
  }

  const rollbackSafe = value.rollbackSafe === true
  const blockVersion = value.blockVersion !== false
  const platforms = parseRecoveryPlatforms(value.platforms)
  const reason =
    typeof value.reason === "string" && value.reason.length > 0 ? value.reason : undefined

  return {
    blockVersion,
    mode,
    platforms,
    ...(reason ? { reason } : {}),
    rollbackSafe,
    targetVersion: value.targetVersion,
    version: value.version,
  }
}

function parseRecoveryPlatforms(value: unknown): RecoveryPlatform[] {
  if (value === undefined) {
    return ["darwin", "win32"]
  }

  if (!Array.isArray(value)) {
    throw new Error("Recovery policy platforms must be an array")
  }

  const platforms = value.filter(isRecoveryPlatform)
  if (platforms.length !== value.length) {
    throw new Error("Recovery policy platforms contains unsupported platform")
  }

  return [...new Set(platforms)]
}

function findRecoveryTarget(input: {
  channel: ReleaseChannel
  currentVersion: string
  platform: NodeJS.Platform
  policy: RecoveryPolicy
}): RecoveryTarget | undefined {
  return input.policy.badVersions.find(
    (entry) =>
      entry.version === input.currentVersion &&
      isCurrentPlatformAllowed(entry.platforms, input.platform) &&
      isChannelEligible(input.channel),
  )
}

function isCurrentPlatformAllowed(
  platforms: RecoveryPlatform[],
  platform: NodeJS.Platform,
): boolean {
  return isRecoveryPlatform(platform) && platforms.includes(platform)
}

function validateRecoveryTarget(
  target: RecoveryTarget,
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

function isChannelEligible(channel: ReleaseChannel): boolean {
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
  type RecoveryPolicy,
  type RecoveryTarget,
}
