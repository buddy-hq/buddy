import { createDecipheriv, createHash } from "node:crypto"
import { z } from "zod"
import type { BrowserImportHost } from "./browser-import-host"
import {
  readChromiumCookieKey,
  type ChromiumCookieKey,
  type ChromiumKeyFailureReason,
  type ChromiumKeyLocation,
} from "./chromium-keys"
import { readDatabaseSnapshot, type ReadOnlyDatabase } from "./cookie-database"
import {
  cookieScope,
  type CookieSameSite,
  type CookieStoreRead,
  type ImportedCookie,
} from "./imported-cookie"

export type ChromiumCookieSource = ChromiumKeyLocation & { readonly databasePath: string }

type ChromiumCookieHost = Pick<
  BrowserImportHost,
  | "platform"
  | "files"
  | "readKeychainPassword"
  | "unprotectWindowsData"
  | "openDatabase"
  | "temporaryDirectory"
>

// OSCrypt uses a fixed IV of 16 spaces.
const AES_CBC_IV = Buffer.alloc(16, 0x20)
const RECORD_PREFIX_LENGTH = 3
const AES_GCM_NONCE_LENGTH = 12
const AES_GCM_TAG_LENGTH = 16
// Schema 24 prefixes plaintext with SHA-256 of the host key.
const DOMAIN_BOUND_SCHEMA_VERSION = 24
const DOMAIN_HASH_LENGTH = 32
// Schema 15 added top_frame_site_key for partitioned (CHIPS) cookies.
const PARTITIONED_SCHEMA_VERSION = 15
// Microseconds since 1601, divided in SQL because the raw value exceeds safe integers.
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600
const COOKIE_COLUMNS =
  "host_key, name, value, encrypted_value, path, expires_utc / 1000000 as expires_seconds, is_secure, is_httponly, samesite"

const schemaVersionRows = z.tuple([
  z.object({
    value: z.union([
      z.number().int().nonnegative(),
      z
        .string()
        .regex(/^\d+$/u)
        .transform((version) => Number(version)),
    ]),
  }),
])

const cookieRows = z.array(
  z.object({
    host_key: z.string(),
    name: z.string(),
    value: z.string(),
    encrypted_value: z.instanceof(Uint8Array),
    path: z.string(),
    expires_seconds: z.number(),
    is_secure: z.number(),
    is_httponly: z.number(),
    samesite: z.number(),
    top_frame_site_key: z.string(),
  }),
)

type ChromiumCookieRecord = z.infer<typeof cookieRows>[number]
type ChromiumCookieRecords = {
  readonly schemaVersion: number
  readonly rows: readonly ChromiumCookieRecord[]
}
type ChromiumValueRead =
  | { readonly _tag: "value"; readonly value: string }
  | { readonly _tag: "skipped" }
  | { readonly _tag: "appBound" }

function stripDomainBinding(
  plaintext: Buffer,
  host: string,
  schemaVersion: number,
): string | undefined {
  if (schemaVersion < DOMAIN_BOUND_SCHEMA_VERSION) return plaintext.toString("utf8")
  const hostHash = createHash("sha256").update(host).digest()
  return plaintext.length >= DOMAIN_HASH_LENGTH &&
    plaintext.subarray(0, DOMAIN_HASH_LENGTH).equals(hostHash)
    ? plaintext.subarray(DOMAIN_HASH_LENGTH).toString("utf8")
    : undefined
}

function decryptCbc(payload: Buffer, key: Buffer, host: string, schemaVersion: number) {
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, AES_CBC_IV)
    const plaintext = Buffer.concat([decipher.update(payload), decipher.final()])
    return stripDomainBinding(plaintext, host, schemaVersion)
  } catch {
    return undefined
  }
}

function decryptGcm(payload: Buffer, key: Buffer, host: string, schemaVersion: number) {
  if (payload.length < AES_GCM_NONCE_LENGTH + AES_GCM_TAG_LENGTH) return undefined
  const nonce = payload.subarray(0, AES_GCM_NONCE_LENGTH)
  const ciphertext = payload.subarray(AES_GCM_NONCE_LENGTH, -AES_GCM_TAG_LENGTH)
  const authTag = payload.subarray(-AES_GCM_TAG_LENGTH)
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return stripDomainBinding(plaintext, host, schemaVersion)
  } catch {
    return undefined
  }
}

async function decryptChromiumValue(
  encrypted: Uint8Array,
  key: ChromiumCookieKey | undefined,
  host: string,
  schemaVersion: number,
  adapter: ChromiumCookieHost,
): Promise<ChromiumValueRead> {
  const record = Buffer.from(encrypted)
  const prefix = record.subarray(0, RECORD_PREFIX_LENGTH).toString("latin1")
  const payload = record.subarray(RECORD_PREFIX_LENGTH)
  if (prefix === "v20" && adapter.platform === "win32") return { _tag: "appBound" }
  if (prefix === "v10") {
    if (key === undefined) return { _tag: "skipped" }
    const value =
      key.algorithm === "aes-128-cbc"
        ? decryptCbc(payload, key.key, host, schemaVersion)
        : decryptGcm(payload, key.key, host, schemaVersion)
    return value === undefined ? { _tag: "skipped" } : { _tag: "value", value }
  }
  if (prefix === "v11") return { _tag: "skipped" }
  if (adapter.platform === "win32") {
    const outcome = await adapter.unprotectWindowsData(record)
    if (outcome._tag === "failed") return { _tag: "skipped" }
    const value = stripDomainBinding(Buffer.from(outcome.bytes), host, schemaVersion)
    return value === undefined ? { _tag: "skipped" } : { _tag: "value", value }
  }
  // Unprefixed values on older macOS stores predate encryption and are plaintext.
  const value = stripDomainBinding(record, host, schemaVersion)
  return value === undefined ? { _tag: "skipped" } : { _tag: "value", value }
}

// -1 unspecified, 0 none, 1 lax, 2 strict; unknown stays unspecified instead of widening to none.
function chromiumSameSite(value: number): CookieSameSite {
  if (value === 0) return "no_restriction"
  if (value === 1) return "lax"
  if (value === 2) return "strict"
  return "unspecified"
}

function readChromiumCookieRecords(database: ReadOnlyDatabase): ChromiumCookieRecords {
  const [{ value: schemaVersion }] = schemaVersionRows.parse(
    database.all("select value from meta where key = 'version'", []),
  )
  const rows = cookieRows.parse(
    database.all(
      schemaVersion >= PARTITIONED_SCHEMA_VERSION
        ? `select ${COOKIE_COLUMNS}, top_frame_site_key from cookies`
        : `select ${COOKIE_COLUMNS}, '' as top_frame_site_key from cookies`,
      [],
    ),
  )
  return { schemaVersion, rows }
}

function recordPrefix(encrypted: Uint8Array): string {
  return Buffer.from(encrypted).subarray(0, RECORD_PREFIX_LENGTH).toString("latin1")
}

async function decryptChromiumCookieRecords(
  records: ChromiumCookieRecords,
  key: ChromiumCookieKey | undefined,
  host: ChromiumCookieHost,
): Promise<CookieStoreRead<ChromiumKeyFailureReason | "appBoundEncryptionUnsupported">> {
  const cookies: ImportedCookie[] = []
  const skippedDomains = new Set<string>()
  let skipped = 0
  let appBoundSkipped = 0
  for (const row of records.rows) {
    // Electron's cookie API cannot express partitioned cookies.
    if (row.top_frame_site_key !== "") {
      skipped += 1
      skippedDomains.add(row.host_key.replace(/^\./u, ""))
      continue
    }
    const valueRead =
      row.encrypted_value.length === 0
        ? ({ _tag: "value", value: row.value } as const)
        : await decryptChromiumValue(
            row.encrypted_value,
            key,
            row.host_key,
            records.schemaVersion,
            host,
          )
    if (valueRead._tag !== "value") {
      skipped += 1
      if (valueRead._tag === "appBound") appBoundSkipped += 1
      skippedDomains.add(row.host_key.replace(/^\./u, ""))
      continue
    }
    const secure = row.is_secure === 1
    cookies.push({
      ...cookieScope(row.host_key, row.path, secure),
      name: row.name,
      value: valueRead.value,
      path: row.path,
      secure,
      httpOnly: row.is_httponly === 1,
      expirationDate:
        row.expires_seconds > 0 ? row.expires_seconds - WINDOWS_EPOCH_OFFSET_SECONDS : undefined,
      sameSite: chromiumSameSite(row.samesite),
    })
  }
  if (cookies.length === 0 && appBoundSkipped > 0) {
    return { _tag: "failed", reason: "appBoundEncryptionUnsupported" }
  }
  return {
    _tag: "read",
    contents: { cookies, skipped, skippedDomains: [...skippedDomains].slice(0, 20) },
  }
}

export async function readChromiumCookies(
  host: ChromiumCookieHost,
  source: ChromiumCookieSource,
): Promise<CookieStoreRead<ChromiumKeyFailureReason | "appBoundEncryptionUnsupported">> {
  const snapshot = await readDatabaseSnapshot({
    databasePath: source.databasePath,
    temporaryDirectory: host.temporaryDirectory,
    openDatabase: host.openDatabase,
    read: readChromiumCookieRecords,
  })
  if (snapshot._tag === "failed") {
    return { _tag: "failed", reason: "readFailed", cause: snapshot.cause }
  }
  const requiresMasterKey = snapshot.value.rows.some(
    (row) => row.encrypted_value.length > 0 && recordPrefix(row.encrypted_value) === "v10",
  )
  let key: ChromiumCookieKey | undefined
  if (requiresMasterKey) {
    const keyRead = await readChromiumCookieKey(host, source)
    if (keyRead._tag === "failed") return keyRead
    key = keyRead.key
  }
  return decryptChromiumCookieRecords(snapshot.value, key, host)
}
