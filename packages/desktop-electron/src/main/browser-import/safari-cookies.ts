import type { BrowserImportFiles } from "./browser-import-files"
import { cookieScope, type CookieStoreRead, type ImportedCookie } from "./imported-cookie"

// Big-endian except page bodies: "cook", u32 pageCount, u32 pageSize[], then pages of u32 0x100,
// u32le cookieCount, u32le offsets[], and records of u32le size, u32le, u32le flags, u32le,
// u32le url/name/path/value offsets, u64, f64 expiry, f64 creation, NUL-terminated strings.
export type BinaryCookiesParse =
  | { readonly _tag: "parsed"; readonly cookies: readonly ImportedCookie[] }
  | { readonly _tag: "malformed" }

type CookieRecordParse =
  | { readonly _tag: "cookie"; readonly cookie: ImportedCookie }
  | { readonly _tag: "unnamed" }
  | { readonly _tag: "malformed" }

// Safari counts seconds from 2001-01-01.
const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200
const FILE_HEADER_SIZE = 8
const PAGE_HEADER_SIZE = 12
const RECORD_HEADER_SIZE = 56
const CHECKSUM_SIZE = 8
const PROPERTY_LIST_LENGTH_SIZE = 4
const FLAG_SECURE = 0x1
const FLAG_HTTP_ONLY = 0x4
const MALFORMED: BinaryCookiesParse = { _tag: "malformed" }

function readCString(record: Buffer, start: number): string {
  const end = record.indexOf(0, start)
  return record.toString("utf8", start, end === -1 ? record.length : end)
}

function parseCookieRecord(record: Buffer): CookieRecordParse {
  const flags = record.readUInt32LE(8)
  const domainOffset = record.readUInt32LE(16)
  const nameOffset = record.readUInt32LE(20)
  const pathOffset = record.readUInt32LE(24)
  const valueOffset = record.readUInt32LE(28)
  const expiry = record.readDoubleLE(40)
  if (
    [domainOffset, nameOffset, pathOffset, valueOffset].some(
      (offset) => offset < RECORD_HEADER_SIZE || offset >= record.length,
    )
  ) {
    return { _tag: "malformed" }
  }
  const domain = readCString(record, domainOffset)
  const name = readCString(record, nameOffset)
  if (domain === "" || name === "") return { _tag: "unnamed" }
  const path = readCString(record, pathOffset) || "/"
  const secure = (flags & FLAG_SECURE) !== 0
  return {
    _tag: "cookie",
    cookie: {
      ...cookieScope(domain, path, secure),
      name,
      value: readCString(record, valueOffset),
      path,
      secure,
      httpOnly: (flags & FLAG_HTTP_ONLY) !== 0,
      expirationDate: expiry > 0 ? Math.floor(expiry) + APPLE_EPOCH_OFFSET_SECONDS : undefined,
      // Safari's SameSite flag bits are undocumented; Lax avoids widening scope.
      sameSite: "lax",
    },
  }
}

function parseCookiePage(page: Buffer): readonly ImportedCookie[] | undefined {
  const cookieCount = page.readUInt32LE(4)
  const offsetTableEnd = PAGE_HEADER_SIZE + cookieCount * 4
  if (offsetTableEnd > page.length) return undefined
  const accepted: { readonly start: number; readonly end: number }[] = []
  const cookies: ImportedCookie[] = []
  for (let index = 0; index < cookieCount; index += 1) {
    const start = page.readUInt32LE(8 + index * 4)
    if (start < offsetTableEnd || start + RECORD_HEADER_SIZE > page.length) return undefined
    const end = start + page.readUInt32LE(start)
    if (
      end - start < RECORD_HEADER_SIZE ||
      end > page.length ||
      accepted.some((record) => start < record.end && end > record.start)
    ) {
      return undefined
    }
    accepted.push({ start, end })
    const record = parseCookieRecord(page.subarray(start, end))
    if (record._tag === "malformed") return undefined
    if (record._tag === "cookie") cookies.push(record.cookie)
  }
  return cookies
}

// Pages are followed by an 8-byte checksum and an optional length-prefixed plist.
function hasValidTrailer(buffer: Buffer, pagesEnd: number): boolean {
  const trailer = buffer.length - pagesEnd
  if (trailer === 0 || trailer === CHECKSUM_SIZE) return true
  const propertyListStart = CHECKSUM_SIZE + PROPERTY_LIST_LENGTH_SIZE
  return (
    trailer >= propertyListStart &&
    trailer === propertyListStart + buffer.readUInt32BE(pagesEnd + CHECKSUM_SIZE)
  )
}

// Buffer.subarray clamps silently, so any out-of-bounds structure rejects the whole jar.
export function parseBinaryCookies(bytes: Uint8Array): BinaryCookiesParse {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length < FILE_HEADER_SIZE || buffer.toString("latin1", 0, 4) !== "cook") {
    return MALFORMED
  }
  const pageCount = buffer.readUInt32BE(4)
  let pageStart = FILE_HEADER_SIZE + pageCount * 4
  if (pageStart > buffer.length) return MALFORMED
  const cookies: ImportedCookie[] = []
  for (let index = 0; index < pageCount; index += 1) {
    const pageSize = buffer.readUInt32BE(FILE_HEADER_SIZE + index * 4)
    if (pageSize < PAGE_HEADER_SIZE || pageStart + pageSize > buffer.length) return MALFORMED
    const page = parseCookiePage(buffer.subarray(pageStart, pageStart + pageSize))
    if (page === undefined) return MALFORMED
    cookies.push(...page)
    pageStart += pageSize
  }
  return hasValidTrailer(buffer, pageStart) ? { _tag: "parsed", cookies } : MALFORMED
}

// stat succeeds without Full Disk Access; only opening the jar reveals a refusal.
export async function safariAccessDenied(
  files: BrowserImportFiles,
  jarPath: string,
): Promise<boolean> {
  return (await files.probeOpen(jarPath, "read")) === "accessDenied"
}

export async function readSafariCookies(
  files: BrowserImportFiles,
  jarPath: string,
): Promise<CookieStoreRead<"needsFullDiskAccess" | "readFailed">> {
  const read = await files.readBytes(jarPath)
  if (read._tag === "accessDenied") return { _tag: "failed", reason: "needsFullDiskAccess" }
  if (read._tag === "failed") return { _tag: "failed", reason: "readFailed", cause: read.cause }
  const parsed = parseBinaryCookies(read.bytes)
  return parsed._tag === "parsed"
    ? { _tag: "read", contents: { cookies: parsed.cookies, skipped: 0, skippedDomains: [] } }
    : { _tag: "failed", reason: "readFailed" }
}
