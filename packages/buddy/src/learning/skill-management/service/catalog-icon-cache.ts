import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { SkillServiceError } from "./contracts"
import { readCatalogEntryByID } from "./library"
import { libraryIconCacheRoot } from "./paths"
import {
  catalogIconReleaseUrl,
  CATALOG_ICON_MEDIA_TYPE,
  type CatalogIconArtifact,
} from "./catalog-icon-reference"

const CATALOG_ICON_FETCH_TIMEOUT_MS = 10_000
export const CATALOG_ICON_MAX_BYTES = 2 * 1024 * 1024
const WEBP_RIFF_HEADER = "RIFF"
const WEBP_FORMAT_HEADER = "WEBP"
const WEBP_FORMAT_HEADER_OFFSET = 8

type CatalogIconFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type CatalogIconCacheDependencies = {
  cacheRoot?: () => string
  fetch?: CatalogIconFetch
  readCatalogEntry?: typeof readCatalogEntryByID
}

export type CachedCatalogIcon = {
  bytes: Uint8Array
  mediaType: typeof CATALOG_ICON_MEDIA_TYPE
  sha256: string
}

const pendingBySha256 = new Map<string, Promise<CachedCatalogIcon>>()

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < WEBP_FORMAT_HEADER_OFFSET + WEBP_FORMAT_HEADER.length) return false
  const header = Buffer.from(bytes)
  return (
    header.subarray(0, WEBP_RIFF_HEADER.length).toString("ascii") === WEBP_RIFF_HEADER &&
    header
      .subarray(WEBP_FORMAT_HEADER_OFFSET, WEBP_FORMAT_HEADER_OFFSET + WEBP_FORMAT_HEADER.length)
      .toString("ascii") === WEBP_FORMAT_HEADER
  )
}

function verifyIconBytes(bytes: Uint8Array, icon: CatalogIconArtifact): CachedCatalogIcon {
  if (bytes.byteLength === 0 || bytes.byteLength > CATALOG_ICON_MAX_BYTES) {
    throw new SkillServiceError("forbidden", "Catalog skill icon exceeds the allowed size")
  }
  if (!isWebp(bytes)) {
    throw new SkillServiceError("forbidden", "Catalog skill icon is not a WebP image")
  }
  if (sha256(bytes) !== icon.sha256) {
    throw new SkillServiceError("forbidden", "Catalog skill icon failed integrity verification")
  }
  return { bytes, mediaType: CATALOG_ICON_MEDIA_TYPE, sha256: icon.sha256 }
}

async function readCachedIcon(
  filepath: string,
  icon: CatalogIconArtifact,
): Promise<CachedCatalogIcon | undefined> {
  const bytes = await fsp.readFile(filepath).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (!bytes) return undefined

  try {
    return verifyIconBytes(bytes, icon)
  } catch {
    await fsp.rm(filepath, { force: true })
    return undefined
  }
}

async function fetchCatalogIcon(
  icon: CatalogIconArtifact,
  fetcher: CatalogIconFetch,
): Promise<CachedCatalogIcon> {
  const response = await fetcher(catalogIconReleaseUrl(icon), {
    headers: {
      Accept: CATALOG_ICON_MEDIA_TYPE,
      "Cache-Control": "no-cache",
      "User-Agent": "Buddy-Skill-Artifacts",
    },
    signal: AbortSignal.timeout(CATALOG_ICON_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new SkillServiceError(
      "upstream_failure",
      `Catalog skill icon fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > CATALOG_ICON_MAX_BYTES) {
    throw new SkillServiceError("forbidden", "Catalog skill icon exceeds the allowed size")
  }

  const reader = response.body?.getReader()
  if (!reader) return verifyIconBytes(new Uint8Array(), icon)

  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      byteLength += result.value.byteLength
      if (byteLength > CATALOG_ICON_MAX_BYTES) {
        await reader.cancel()
        throw new SkillServiceError("forbidden", "Catalog skill icon exceeds the allowed size")
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return verifyIconBytes(bytes, icon)
}

async function writeCachedIcon(filepath: string, bytes: Uint8Array): Promise<void> {
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  const temporaryPath = `${filepath}.${process.pid}.${Date.now()}.tmp`
  try {
    await fsp.writeFile(temporaryPath, bytes)
    await fsp.rename(temporaryPath, filepath)
  } finally {
    await fsp.rm(temporaryPath, { force: true })
  }
}

async function loadCatalogIcon(
  icon: CatalogIconArtifact,
  dependencies: CatalogIconCacheDependencies,
): Promise<CachedCatalogIcon> {
  const cacheRoot = (dependencies.cacheRoot ?? libraryIconCacheRoot)()
  const filepath = path.join(cacheRoot, `${icon.sha256}.webp`)
  const cached = await readCachedIcon(filepath, icon)
  if (cached) return cached

  const fetched = await fetchCatalogIcon(icon, dependencies.fetch ?? fetch)
  await writeCachedIcon(filepath, fetched.bytes)
  return fetched
}

export async function readCatalogIcon(
  skillID: string,
  expectedSha256: string,
  dependencies: CatalogIconCacheDependencies = {},
): Promise<CachedCatalogIcon> {
  const entry = await (dependencies.readCatalogEntry ?? readCatalogEntryByID)(skillID)
  if (!entry?.icon || entry.icon.sha256 !== expectedSha256) {
    throw new SkillServiceError("not_found", "Catalog skill icon not found")
  }

  const existing = pendingBySha256.get(entry.icon.sha256)
  if (existing) return await existing

  const icon = entry.icon
  const task = loadCatalogIcon(icon, dependencies).finally(() => {
    pendingBySha256.delete(icon.sha256)
  })
  pendingBySha256.set(icon.sha256, task)
  return await task
}
