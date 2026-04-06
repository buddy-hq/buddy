import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { decompress, init as initZstd } from "@bokuweb/zstd-wasm"

const KNOWLEDGE_GRAPH_DIRECTORY_NAME = "knowledge-graph"
const KNOWLEDGE_GRAPH_MANIFEST_FILENAME = "learning-commons-knowledge-graph.db.json"

type KnowledgeGraphArtifactManifest = {
  archiveChecksum: string
  archiveFilename: string
  archiveSizeBytes: number
  builtAt: string
  databaseChecksum: string
  databaseFilename: string
  databaseSizeBytes: number
  nodesURL: string
  relationshipsURL: string
  schemaVersion: string
  version: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function parseManifest(value: unknown): KnowledgeGraphArtifactManifest | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (
    !isNonEmptyString(record.archiveChecksum) ||
    !isNonEmptyString(record.archiveFilename) ||
    !isNonNegativeInteger(record.archiveSizeBytes) ||
    !isNonEmptyString(record.builtAt) ||
    !isNonEmptyString(record.databaseChecksum) ||
    !isNonEmptyString(record.databaseFilename) ||
    !isNonNegativeInteger(record.databaseSizeBytes) ||
    !isNonEmptyString(record.nodesURL) ||
    !isNonEmptyString(record.relationshipsURL) ||
    !isNonEmptyString(record.schemaVersion) ||
    !isNonEmptyString(record.version)
  ) {
    return undefined
  }

  return {
    archiveChecksum: record.archiveChecksum,
    archiveFilename: record.archiveFilename,
    archiveSizeBytes: record.archiveSizeBytes,
    builtAt: record.builtAt,
    databaseChecksum: record.databaseChecksum,
    databaseFilename: record.databaseFilename,
    databaseSizeBytes: record.databaseSizeBytes,
    nodesURL: record.nodesURL,
    relationshipsURL: record.relationshipsURL,
    schemaVersion: record.schemaVersion,
    version: record.version,
  }
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

let zstdInitialization: Promise<void> | undefined

function ensureZstdInitialized() {
  zstdInitialization ??= initZstd()
  return zstdInitialization
}

async function readManifest(manifestPath: string) {
  const manifest = parseManifest(JSON.parse(await fsp.readFile(manifestPath, "utf8")) as unknown)
  if (!manifest) {
    throw new Error(`Knowledge Graph manifest is invalid at ${manifestPath}`)
  }
  return manifest
}

async function installedManifest(manifestPath: string) {
  if (!existsSync(manifestPath)) {
    return undefined
  }

  try {
    return await readManifest(manifestPath)
  } catch {
    return undefined
  }
}

export async function ensureBundledKnowledgeGraphDatabase(input: {
  resourcesDir: string
  xdgDataHome: string
}) {
  const bundledDirectory = path.join(input.resourcesDir, KNOWLEDGE_GRAPH_DIRECTORY_NAME)
  const bundledManifestPath = path.join(bundledDirectory, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)

  if (!existsSync(bundledManifestPath)) {
    throw new Error(`Bundled Knowledge Graph manifest not found at ${bundledManifestPath}`)
  }

  const bundledManifest = await readManifest(bundledManifestPath)
  const bundledArchivePath = path.join(bundledDirectory, bundledManifest.archiveFilename)
  if (!existsSync(bundledArchivePath)) {
    throw new Error(`Bundled Knowledge Graph archive not found at ${bundledArchivePath}`)
  }
  const installRoot = path.join(
    input.xdgDataHome,
    KNOWLEDGE_GRAPH_DIRECTORY_NAME,
    bundledManifest.version,
  )
  const installedManifestPath = path.join(installRoot, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)
  const installedDatabasePath = path.join(installRoot, bundledManifest.databaseFilename)
  const currentInstalledManifest = await installedManifest(installedManifestPath)

  if (
    currentInstalledManifest &&
    currentInstalledManifest.archiveChecksum === bundledManifest.archiveChecksum &&
    currentInstalledManifest.databaseChecksum === bundledManifest.databaseChecksum &&
    existsSync(installedDatabasePath)
  ) {
    return installedDatabasePath
  }

  await ensureZstdInitialized()
  const archiveBytes = await fsp.readFile(bundledArchivePath)
  const archiveChecksum = sha256(archiveBytes)
  if (archiveChecksum !== bundledManifest.archiveChecksum) {
    throw new Error(
      `Bundled Knowledge Graph archive checksum mismatch: expected ${bundledManifest.archiveChecksum}, got ${archiveChecksum}`,
    )
  }

  const databaseBytes = Buffer.from(decompress(archiveBytes))
  const databaseChecksum = sha256(databaseBytes)
  if (databaseChecksum !== bundledManifest.databaseChecksum) {
    throw new Error(
      `Bundled Knowledge Graph database checksum mismatch: expected ${bundledManifest.databaseChecksum}, got ${databaseChecksum}`,
    )
  }

  await fsp.mkdir(installRoot, { recursive: true })
  const tempDatabasePath = `${installedDatabasePath}.tmp-${process.pid}-${Date.now()}`

  try {
    await fsp.writeFile(tempDatabasePath, databaseBytes)
    await fsp.rm(installedDatabasePath, { force: true }).catch(() => undefined)
    await fsp.rename(tempDatabasePath, installedDatabasePath)
    await fsp.writeFile(
      installedManifestPath,
      `${JSON.stringify(bundledManifest, null, 2)}\n`,
      "utf8",
    )
  } finally {
    await fsp.rm(tempDatabasePath, { force: true }).catch(() => undefined)
  }

  return installedDatabasePath
}
