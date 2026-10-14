import { generateKeyPairSync, sign } from "node:crypto"

/** Sign fixture content with an ephemeral Ed25519 key in the minisign transport format. */
export function signedUpdateFixture(content: string) {
  const keys = generateKeyPairSync("ed25519")
  const keyID = Buffer.from("test-key")
  const rawPublicKey = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32)
  const publicKey = Buffer.concat([Buffer.from("Ed"), keyID, rawPublicKey]).toString("base64")
  const signature = sign(null, Buffer.from(content), keys.privateKey)
  const trustedComment = "fixture"
  const globalSignature = sign(
    null,
    Buffer.concat([signature, Buffer.from(trustedComment)]),
    keys.privateKey,
  )
  const signatureText = `untrusted comment: fixture\n${Buffer.concat([Buffer.from("Ed"), keyID, signature]).toString("base64")}\ntrusted comment: ${trustedComment}\n${globalSignature.toString("base64")}\n`
  return { publicKey, signature: Buffer.from(signatureText).toString("base64") }
}
