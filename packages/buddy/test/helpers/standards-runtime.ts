import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { compress, init as initZstd } from "@bokuweb/zstd-wasm"
import {
  createKnowledgeGraphArtifactManifest,
  knowledgeGraphArchiveChecksumFileContents,
} from "../../src/learning/knowledge-graph/artifact"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "../../src/learning/knowledge-graph/constants"
import { StandardsRuntimeService } from "../../src/local-runtimes/standards/service"

const STANDARDS_ASSET_BASE_URL_ENV = "BUDDY_STANDARDS_ASSET_BASE_URL"
const STANDARDS_LOCAL_ASSET_DIR_ENV = "BUDDY_STANDARDS_LOCAL_ASSET_DIR"
const MOCK_STANDARDS_ASSET_BASE_URL = "https://standards.invalid/releases"
const MOCK_SCHEMA_VERSION = "1"
const MOCK_NODES_URL = "https://standards.invalid/mock/nodes.jsonl"
const MOCK_RELATIONSHIPS_URL = "https://standards.invalid/mock/relationships.jsonl"
const DEFAULT_BUNDLE_MARKER = "default"

type MockStandardsBundleOptions = {
  marker?: string
}

type MockStandardsBundle = {
  archiveBytes: Uint8Array
  checksumText: string
  manifestJson: string
}

let zstdInitialization: Promise<void> | undefined

function ensureZstdInitialized() {
  zstdInitialization ??= initZstd()
  return zstdInitialization
}

function sha256Bytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

async function buildMockStandardsBundle(
  options: MockStandardsBundleOptions = {},
): Promise<MockStandardsBundle> {
  await ensureZstdInitialized()

  const marker = options.marker ?? DEFAULT_BUNDLE_MARKER
  const version = `test-${randomUUID()}`
  const databaseBytes = Buffer.from(`buddy-standards-db-${version}-${marker}`, "utf8")
  const archiveBytes = Uint8Array.from(compress(databaseBytes, 19))
  const archiveChecksum = sha256Bytes(archiveBytes)
  const databaseChecksum = sha256Bytes(databaseBytes)
  const manifest = createKnowledgeGraphArtifactManifest({
    archiveChecksum,
    archiveSizeBytes: archiveBytes.byteLength,
    builtAt: new Date().toISOString(),
    databaseChecksum,
    databaseSizeBytes: databaseBytes.byteLength,
    nodesURL: MOCK_NODES_URL,
    relationshipsURL: MOCK_RELATIONSHIPS_URL,
    schemaVersion: MOCK_SCHEMA_VERSION,
    version,
  })

  return {
    archiveBytes,
    checksumText: knowledgeGraphArchiveChecksumFileContents(manifest),
    manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
  }
}

export async function withMockStandardsRuntimeAssets<T>(run: () => Promise<T>) {
  const previousFetch = globalThis.fetch
  const previousAssetBaseUrl = process.env[STANDARDS_ASSET_BASE_URL_ENV]
  const previousLocalAssetDir = process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]
  const bundle = await buildMockStandardsBundle()

  process.env[STANDARDS_ASSET_BASE_URL_ENV] = MOCK_STANDARDS_ASSET_BASE_URL
  delete process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]

  await StandardsRuntimeService.remove().catch(() => undefined)

  const assetInfo = StandardsRuntimeService.runtimeAssetInfo()
  globalThis.fetch = (async (input) => {
    const url = String(input)
    if (url === `${MOCK_STANDARDS_ASSET_BASE_URL}/${assetInfo.archiveFilename}`) {
      return new Response(Uint8Array.from(bundle.archiveBytes), { status: 200 })
    }
    if (url === `${MOCK_STANDARDS_ASSET_BASE_URL}/${assetInfo.checksumFilename}`) {
      return new Response(bundle.checksumText, { status: 200 })
    }
    if (url === `${MOCK_STANDARDS_ASSET_BASE_URL}/${assetInfo.manifestFilename}`) {
      return new Response(bundle.manifestJson, { status: 200 })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  try {
    return await run()
  } finally {
    await StandardsRuntimeService.remove().catch(() => undefined)
    globalThis.fetch = previousFetch

    if (previousAssetBaseUrl === undefined) delete process.env[STANDARDS_ASSET_BASE_URL_ENV]
    else process.env[STANDARDS_ASSET_BASE_URL_ENV] = previousAssetBaseUrl

    if (previousLocalAssetDir === undefined) delete process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]
    else process.env[STANDARDS_LOCAL_ASSET_DIR_ENV] = previousLocalAssetDir
  }
}

export async function withLocalMockStandardsRuntimeAssets<T>(run: () => Promise<T>) {
  const previousAssetBaseUrl = process.env[STANDARDS_ASSET_BASE_URL_ENV]
  const previousLocalAssetDir = process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]
  const localAssetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-standards-local-assets-"))
  const bundle = await buildMockStandardsBundle()

  delete process.env[STANDARDS_ASSET_BASE_URL_ENV]
  process.env[STANDARDS_LOCAL_ASSET_DIR_ENV] = localAssetRoot

  await StandardsRuntimeService.remove().catch(() => undefined)

  await fs.writeFile(
    path.join(localAssetRoot, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME),
    bundle.archiveBytes,
  )
  await fs.writeFile(
    path.join(localAssetRoot, KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME),
    bundle.checksumText,
    "utf8",
  )
  await fs.writeFile(
    path.join(localAssetRoot, KNOWLEDGE_GRAPH_MANIFEST_FILENAME),
    bundle.manifestJson,
    "utf8",
  )

  try {
    return await run()
  } finally {
    await StandardsRuntimeService.remove().catch(() => undefined)
    await fs.rm(localAssetRoot, { recursive: true, force: true }).catch(() => undefined)

    if (previousAssetBaseUrl === undefined) delete process.env[STANDARDS_ASSET_BASE_URL_ENV]
    else process.env[STANDARDS_ASSET_BASE_URL_ENV] = previousAssetBaseUrl

    if (previousLocalAssetDir === undefined) delete process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]
    else process.env[STANDARDS_LOCAL_ASSET_DIR_ENV] = previousLocalAssetDir
  }
}
