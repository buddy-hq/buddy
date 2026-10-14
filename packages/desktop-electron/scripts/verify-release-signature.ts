import { verifySignedMessage } from "@buddy/script/minisign"
import { requireUpdaterPublicKey, type BuddyDistribution } from "@buddy/script/distribution"
import { releaseDistribution } from "../../../script/release/distribution-guard"

export async function verifyReleaseSignature(
  filePath: string,
  distribution: BuddyDistribution = releaseDistribution(),
): Promise<void> {
  const publicKey = requireUpdaterPublicKey(distribution)
  const verified = await verifySignedMessage({
    message: await Bun.file(filePath).bytes(),
    publicKey,
    signatureFileText: await Bun.file(`${filePath}.sig`).text(),
  })
  if (!verified) {
    throw new Error(`Updater signing key does not match ${distribution.productName}: ${filePath}`)
  }
}
