import { getStore } from "./store"
import {
  BUDDY_MINISIGN_PUBLIC_KEY,
  BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY,
  fetchSignedText,
  resolveLatestReleaseAssetUrl,
} from "./update-common"
import {
  findRecoveryTarget,
  parseRecoveryPolicy,
  validateRecoveryTarget,
  type RecoveryPolicy,
  type RecoveryTarget,
} from "./recovery-policy-core"

const RECOVERY_POLICY_FILENAME = "recovery-policy.json"
const BUDDY_RECOVERY_POLICY_URL_ENV_KEY = "BUDDY_RECOVERY_POLICY_URL"
const RECOVERY_STORE_NAME = "buddy.recovery"
const BLOCKED_UPDATE_VERSIONS_KEY = "blockedUpdateVersions"

type LoggerLike = {
  warn: (...args: unknown[]) => void
}

type RecoveryPolicyInput = {
  logger: LoggerLike
  policyUrl?: string
  publicKey?: string
}

function resolveRecoveryPolicyUrl(): string {
  return (
    process.env[BUDDY_RECOVERY_POLICY_URL_ENV_KEY]?.trim() ||
    resolveLatestReleaseAssetUrl(RECOVERY_POLICY_FILENAME)
  )
}

function resolveRecoveryPublicKey(): string {
  return process.env[BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY]?.trim() || BUDDY_MINISIGN_PUBLIC_KEY
}

async function fetchRecoveryPolicy(
  input: RecoveryPolicyInput,
): Promise<RecoveryPolicy | undefined> {
  try {
    const policyText = await fetchSignedText({
      publicKey: input.publicKey ?? resolveRecoveryPublicKey(),
      url: input.policyUrl ?? resolveRecoveryPolicyUrl(),
    })
    return parseRecoveryPolicy(policyText)
  } catch (error) {
    input.logger.warn("recovery policy unavailable", error)
    return undefined
  }
}

function readBlockedUpdateVersions(): string[] {
  const value = getStore(RECOVERY_STORE_NAME).get(BLOCKED_UPDATE_VERSIONS_KEY)
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
}

function blockUpdateVersion(version: string): void {
  const versions = new Set(readBlockedUpdateVersions())
  versions.add(version)
  getStore(RECOVERY_STORE_NAME).set(BLOCKED_UPDATE_VERSIONS_KEY, [...versions].toSorted())
}

function isUpdateVersionBlocked(version: string): boolean {
  return readBlockedUpdateVersions().includes(version)
}

export {
  blockUpdateVersion,
  fetchRecoveryPolicy,
  findRecoveryTarget,
  isUpdateVersionBlocked,
  parseRecoveryPolicy,
  validateRecoveryTarget,
  type RecoveryTarget,
}
