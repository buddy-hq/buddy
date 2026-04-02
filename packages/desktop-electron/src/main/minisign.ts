import { webcrypto } from "node:crypto"
import { blake2b } from "blakejs"

const BASE64_ENCODING = "base64"
const BASE64_URL_ENCODING = "base64url"
const UTF8_ENCODING = "utf8"
const PUBLIC_KEY_PREFIX = "RW"
const SIGNATURE_COMMENT_PREFIX = "untrusted comment: "
const TRUSTED_COMMENT_PREFIX = "trusted comment: "
const PUBLIC_KEY_LENGTH_BYTES = 42
const SIGNATURE_LENGTH_BYTES = 74
const ED25519_SIGNATURE_LENGTH_BYTES = 64
const KEY_ID_LENGTH_BYTES = 8
const PUBLIC_KEY_DATA_OFFSET = 2 + KEY_ID_LENGTH_BYTES
const SIGNATURE_DATA_OFFSET = 2 + KEY_ID_LENGTH_BYTES
const HASHED_SIGNATURE_ALGORITHM = "ED"
const RAW_SIGNATURE_ALGORITHM = "Ed"
const BLAKE2B_OUTPUT_LENGTH_BYTES = 64

type MinisignPublicKey = {
  cryptoKey: Awaited<ReturnType<typeof webcrypto.subtle.importKey>>
  keyId: Uint8Array
}

type ParsedSignature = {
  algorithm: typeof HASHED_SIGNATURE_ALGORITHM | typeof RAW_SIGNATURE_ALGORITHM
  keyId: Uint8Array
  signature: Uint8Array
}

type ParsedSignatureFile = {
  trustedComment: string
  signature: ParsedSignature
  globalSignature: Uint8Array
}

type VerifySignedMessageInput = {
  message: Uint8Array
  publicKey: string
  signatureFileText: string
}

export async function verifySignedMessage(input: VerifySignedMessageInput): Promise<boolean> {
  const [publicKey, signatureFile] = await Promise.all([
    parsePublicKey(input.publicKey),
    parseSignatureFile(input.signatureFileText),
  ])

  if (!equalBytes(publicKey.keyId, signatureFile.signature.keyId)) {
    return false
  }

  const signedMessage =
    signatureFile.signature.algorithm === HASHED_SIGNATURE_ALGORITHM
      ? blake2b(input.message, undefined, BLAKE2B_OUTPUT_LENGTH_BYTES)
      : input.message

  const isMessageValid = await webcrypto.subtle.verify(
    "Ed25519",
    publicKey.cryptoKey,
    signatureFile.signature.signature,
    signedMessage,
  )

  if (!isMessageValid) {
    return false
  }

  const trustedCommentBytes = new TextEncoder().encode(signatureFile.trustedComment)
  const commentPayload = new Uint8Array(
    signatureFile.signature.signature.length + trustedCommentBytes.length,
  )
  commentPayload.set(signatureFile.signature.signature, 0)
  commentPayload.set(trustedCommentBytes, signatureFile.signature.signature.length)

  return await webcrypto.subtle.verify(
    "Ed25519",
    publicKey.cryptoKey,
    signatureFile.globalSignature,
    commentPayload,
  )
}

async function parsePublicKey(publicKeyText: string): Promise<MinisignPublicKey> {
  const trimmed = publicKeyText.trim()
  if (!trimmed.startsWith(PUBLIC_KEY_PREFIX)) {
    throw new Error("Invalid minisign public key prefix")
  }

  const bytes = Buffer.from(trimmed, BASE64_ENCODING)
  if (bytes.length !== PUBLIC_KEY_LENGTH_BYTES) {
    throw new Error("Invalid minisign public key length")
  }

  const keyId = bytes.subarray(2, PUBLIC_KEY_DATA_OFFSET)
  const publicKeyData = bytes.subarray(PUBLIC_KEY_DATA_OFFSET)
  const cryptoKey = await webcrypto.subtle.importKey(
    "jwk",
    {
      kty: "OKP",
      crv: "Ed25519",
      x: Buffer.from(publicKeyData).toString(BASE64_URL_ENCODING),
    },
    { name: "Ed25519" },
    false,
    ["verify"],
  )

  return {
    cryptoKey,
    keyId,
  }
}

function parseSignatureFile(signatureFileText: string): ParsedSignatureFile {
  const lines = signatureFileText.trim().split(/\r?\n/)
  if (lines.length < 4) {
    throw new Error("Invalid minisign signature content")
  }

  const [commentLine, signatureLine, trustedCommentLine, globalSignatureLine] = lines
  if (!commentLine?.startsWith(SIGNATURE_COMMENT_PREFIX)) {
    throw new Error("Invalid minisign untrusted comment")
  }
  if (!trustedCommentLine?.startsWith(TRUSTED_COMMENT_PREFIX)) {
    throw new Error("Invalid minisign trusted comment")
  }

  const signature = parseSignature(signatureLine)
  const globalSignature = Buffer.from(globalSignatureLine, BASE64_ENCODING)
  if (globalSignature.length !== ED25519_SIGNATURE_LENGTH_BYTES) {
    throw new Error("Invalid minisign global signature length")
  }

  return {
    trustedComment: trustedCommentLine.slice(TRUSTED_COMMENT_PREFIX.length),
    signature,
    globalSignature,
  }
}

function parseSignature(signatureText: string): ParsedSignature {
  const bytes = Buffer.from(signatureText, BASE64_ENCODING)
  if (bytes.length !== SIGNATURE_LENGTH_BYTES) {
    throw new Error("Invalid minisign signature length")
  }

  const algorithmBytes = bytes.subarray(0, 2)
  const algorithm = Buffer.from(algorithmBytes).toString(UTF8_ENCODING)
  if (algorithm !== RAW_SIGNATURE_ALGORITHM && algorithm !== HASHED_SIGNATURE_ALGORITHM) {
    throw new Error("Invalid minisign signature algorithm")
  }

  return {
    algorithm,
    keyId: bytes.subarray(2, SIGNATURE_DATA_OFFSET),
    signature: bytes.subarray(SIGNATURE_DATA_OFFSET),
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}
