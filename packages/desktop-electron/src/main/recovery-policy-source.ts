import type { BuddyDistribution } from "@buddy/script/distribution"
import { UPDATE_RING_STABLE } from "@buddy/update-contract"
import {
  UPDATE_DISTRIBUTION,
  resolveUpdatePublicKeyOverride,
  resolveUpdateVerificationPublicKey,
  fetchSignedText,
  resolveLatestRingAssetUrl,
} from "./update-common"
import { parseRecoveryPolicy, type RecoveryPolicy } from "./recovery-policy-core"

const RECOVERY_POLICY_FILENAME = "recovery-policy.json"
const BUDDY_RECOVERY_POLICY_URL_ENV_KEY = "BUDDY_RECOVERY_POLICY_URL"

type LoggerLike = {
  warn: (...args: unknown[]) => void
}

type RecoveryPolicyInput = {
  distribution?: BuddyDistribution
  logger: LoggerLike
  policyUrl?: string
  publicKey?: string
}

/** Prod retains its latest/override policy; Beta discovers the highest numeric release. */
export async function resolveRecoveryPolicyUrl(
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): Promise<string> {
  const override =
    distribution.id === "prod" ? process.env[BUDDY_RECOVERY_POLICY_URL_ENV_KEY]?.trim() : undefined
  return (
    override ||
    (await resolveLatestRingAssetUrl({
      distribution,
      filename: RECOVERY_POLICY_FILENAME,
      ring: UPDATE_RING_STABLE,
    }))
  )
}

/** Fetch a signed policy and attach the verifying distribution as local provenance. */
export async function fetchRecoveryPolicy(
  input: RecoveryPolicyInput,
): Promise<RecoveryPolicy | undefined> {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  try {
    const publicKey = resolveUpdateVerificationPublicKey(
      distribution,
      input.publicKey ?? resolveUpdatePublicKeyOverride(distribution),
    )
    const policyText = await fetchSignedText({
      distribution,
      publicKey,
      url: input.policyUrl ?? (await resolveRecoveryPolicyUrl(distribution)),
    })
    return parseRecoveryPolicy(policyText, distribution.id)
  } catch (error) {
    input.logger.warn("recovery policy unavailable", error)
    return undefined
  }
}
