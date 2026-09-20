import { pbkdf2Sync } from "node:crypto"
import { z } from "zod"
import type { BrowserImportHost } from "./browser-import-host"

export type ChromiumCookieKey = {
  readonly algorithm: "aes-128-cbc" | "aes-256-gcm"
  readonly key: Buffer
}

export type ChromiumKeyFailureReason =
  | "needsKeychainApproval"
  | "keychainItemMissing"
  | "keychainUnavailable"
  | "windowsDataProtectionUnavailable"
  | "unsupportedPlatform"
  | "readFailed"

export type ChromiumKeyRead =
  | { readonly _tag: "key"; readonly key: ChromiumCookieKey }
  | { readonly _tag: "failed"; readonly reason: ChromiumKeyFailureReason; readonly cause?: unknown }

export type ChromiumKeyLocation = {
  readonly localStatePath: string
  readonly macKeychain?: {
    readonly service: string
    readonly account: string
  }
}

type ChromiumKeyHost = Pick<
  BrowserImportHost,
  "platform" | "files" | "readKeychainPassword" | "unprotectWindowsData"
>

const MAC_KEY_SALT = "saltysalt"
const MAC_KEY_ITERATIONS = 1003
const MAC_KEY_LENGTH = 16
const WINDOWS_KEY_LENGTH = 32
const DPAPI_KEY_PREFIX = Buffer.from("DPAPI")
const windowsLocalState = z.object({
  os_crypt: z.object({ encrypted_key: z.string().min(1) }),
})

function keyReadFailed(reason: ChromiumKeyFailureReason, cause?: unknown): ChromiumKeyRead {
  return { _tag: "failed", reason, cause }
}

async function readMacKey(
  host: ChromiumKeyHost,
  location: ChromiumKeyLocation,
): Promise<ChromiumKeyRead> {
  if (location.macKeychain === undefined) return keyReadFailed("readFailed")
  // Untimed: the Keychain prompt is modal, and timing out would discard the user's approval.
  const outcome = await host.readKeychainPassword(
    location.macKeychain.service,
    location.macKeychain.account,
  )
  if (outcome["_tag"] === "failed") return keyReadFailed(outcome.reason, outcome.cause)
  const key = pbkdf2Sync(outcome.value, MAC_KEY_SALT, MAC_KEY_ITERATIONS, MAC_KEY_LENGTH, "sha1")
  return { _tag: "key", key: { algorithm: "aes-128-cbc", key } }
}

function parseWindowsEncryptedKey(text: string): Buffer | undefined {
  try {
    const parsed = windowsLocalState.safeParse(JSON.parse(text))
    if (!parsed.success) return undefined
    const encoded = parsed.data.os_crypt.encrypted_key
    if (!/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u.test(encoded)) {
      return undefined
    }
    const protectedKey = Buffer.from(encoded, "base64")
    if (!protectedKey.subarray(0, DPAPI_KEY_PREFIX.length).equals(DPAPI_KEY_PREFIX)) {
      return undefined
    }
    const encrypted = protectedKey.subarray(DPAPI_KEY_PREFIX.length)
    return encrypted.length > 0 ? encrypted : undefined
  } catch {
    return undefined
  }
}

async function readWindowsKey(
  host: ChromiumKeyHost,
  location: ChromiumKeyLocation,
): Promise<ChromiumKeyRead> {
  const localState = await host.files.readText(location.localStatePath)
  if (localState === undefined) return keyReadFailed("readFailed")
  const encrypted = parseWindowsEncryptedKey(localState)
  if (encrypted === undefined) return keyReadFailed("readFailed")
  const outcome = await host.unprotectWindowsData(encrypted)
  if (outcome["_tag"] === "failed") {
    return keyReadFailed("windowsDataProtectionUnavailable", outcome.cause)
  }
  const key = Buffer.from(outcome.bytes)
  return key.length === WINDOWS_KEY_LENGTH
    ? { _tag: "key", key: { algorithm: "aes-256-gcm", key } }
    : keyReadFailed("readFailed")
}

export async function readChromiumCookieKey(
  host: ChromiumKeyHost,
  location: ChromiumKeyLocation,
): Promise<ChromiumKeyRead> {
  if (host.platform === "darwin") return readMacKey(host, location)
  if (host.platform === "win32") return readWindowsKey(host, location)
  return keyReadFailed("unsupportedPlatform")
}
