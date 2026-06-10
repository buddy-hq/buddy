import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { zstdDecompressSync } from "node:zlib"
import type { KnowledgeGraphArtifactManifest } from "./artifact"
import {
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_ENV,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
  KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
  KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME,
} from "./constants"
import { parseKnowledgeGraphArtifactManifest } from "./artifact"
import { withFileLockSync } from "../../../storage/file-lock"

const KNOWLEDGE_GRAPH_CACHE_DIRECTORY_NAME = "buddy-knowledge-graph"
const BYTES_PER_KIB = 1024
const KIB_PER_MIB = 1024
const FILE_HASH_CHUNK_BYTES = BYTES_PER_KIB * KIB_PER_MIB
const MATERIALIZED_VALIDATION_CACHE_KEY_SEPARATOR = "\0"

type MaterializedDatabaseStats = {
  dev: number
  ino: number
  size: number
  mtimeMs: number
  ctimeMs: number
}

type MaterializedDatabaseValidation = {
  stats: MaterializedDatabaseStats
}

const materializedValidationCache = new Map<string, MaterializedDatabaseValidation>()

function resolveConfiguredKnowledgeGraphPath() {
  const configured = process.env[KNOWLEDGE_GRAPH_DB_ENV]?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }

  try {
    return path.resolve(decodeURIComponent(configured))
  } catch {
    return path.resolve(configured)
  }
}

function candidateRoots() {
  const roots = [
    process.cwd(),
    path.dirname(process.execPath),
    import.meta.dir,
    path.resolve(import.meta.dir, "../../../.."),
  ]

  return Array.from(new Set(roots.map((root) => path.resolve(root))))
}

function candidatePathsForRoot(root: string) {
  return [
    path.join(root, KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY, KNOWLEDGE_GRAPH_DB_FILENAME),
    path.join(root, KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY, KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME),
    path.join(
      root,
      "packages/desktop-electron/resources",
      KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
      KNOWLEDGE_GRAPH_DB_FILENAME,
    ),
    path.join(
      root,
      "packages/desktop-electron/resources",
      KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
      KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME,
    ),
    path.join(
      root,
      "packages/buddy/resources",
      KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
      KNOWLEDGE_GRAPH_DB_FILENAME,
    ),
    path.join(
      root,
      "packages/buddy/resources",
      KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
      KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME,
    ),
  ]
}

function candidateResourceDirectoriesForRoot(root: string) {
  return [
    path.join(root, KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY),
    path.join(root, "packages/desktop-electron/resources", KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY),
    path.join(root, "packages/buddy/resources", KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY),
  ]
}

function legacySourceDatabasePathForRoot(root: string) {
  return path.join(root, "../learning-commons/knowledge-graph", KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME)
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function sha256FileSync(filepath: string) {
  const hash = createHash("sha256")
  const file = fs.openSync(filepath, "r")
  const buffer = Buffer.alloc(FILE_HASH_CHUNK_BYTES)

  try {
    while (true) {
      const bytesRead = fs.readSync(file, buffer, 0, buffer.length, null)
      if (bytesRead === 0) {
        break
      }
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(file)
  }

  return hash.digest("hex")
}

function materializedDatabaseStats(stats: fs.Stats): MaterializedDatabaseStats {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  }
}

function materializedDatabaseStatsMatch(
  left: MaterializedDatabaseStats,
  right: MaterializedDatabaseStats,
) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

function materializedValidationCacheKey(
  cachePath: string,
  manifest: KnowledgeGraphArtifactManifest,
) {
  return [
    cachePath,
    manifest.version,
    manifest.archiveChecksum,
    manifest.databaseChecksum,
    String(manifest.databaseSizeBytes),
  ].join(MATERIALIZED_VALIDATION_CACHE_KEY_SEPARATOR)
}

function rememberMaterializedDatabaseValidation(
  cachePath: string,
  manifest: KnowledgeGraphArtifactManifest,
) {
  try {
    const stats = fs.statSync(cachePath)
    if (!stats.isFile() || stats.size !== manifest.databaseSizeBytes) {
      return
    }

    materializedValidationCache.set(materializedValidationCacheKey(cachePath, manifest), {
      stats: materializedDatabaseStats(stats),
    })
  } catch {
    return
  }
}

function readBundledArtifactManifest(resourceDir: string) {
  const manifestPath = path.join(resourceDir, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) {
    return undefined
  }

  try {
    return parseKnowledgeGraphArtifactManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")))
  } catch {
    return undefined
  }
}

function cachePathForBundledArtifact(resourceDir: string) {
  const manifest = readBundledArtifactManifest(resourceDir)
  if (!manifest) {
    return undefined
  }

  return path.join(
    os.tmpdir(),
    KNOWLEDGE_GRAPH_CACHE_DIRECTORY_NAME,
    manifest.version,
    manifest.archiveChecksum,
    manifest.databaseFilename,
  )
}

function materializationLockPath(cachePath: string) {
  return path.join(path.dirname(cachePath), `${path.basename(cachePath)}.lock`)
}

function materializedDatabaseIsValid(cachePath: string, manifest: KnowledgeGraphArtifactManifest) {
  const cacheKey = materializedValidationCacheKey(cachePath, manifest)
  try {
    const stats = fs.statSync(cachePath)
    if (!stats.isFile() || stats.size !== manifest.databaseSizeBytes) {
      materializedValidationCache.delete(cacheKey)
      return false
    }

    const databaseStats = materializedDatabaseStats(stats)
    const remembered = materializedValidationCache.get(cacheKey)
    if (remembered && materializedDatabaseStatsMatch(remembered.stats, databaseStats)) {
      return true
    }

    const valid = sha256FileSync(cachePath) === manifest.databaseChecksum
    if (valid) {
      materializedValidationCache.set(cacheKey, { stats: databaseStats })
    } else {
      materializedValidationCache.delete(cacheKey)
    }
    return valid
  } catch {
    materializedValidationCache.delete(cacheKey)
    return false
  }
}

export function materializeBundledKnowledgeGraphDatabase(resourceDir: string) {
  const manifest = readBundledArtifactManifest(resourceDir)
  if (!manifest) {
    return undefined
  }

  const archivePath = path.join(resourceDir, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
  if (!fs.existsSync(archivePath)) {
    return undefined
  }

  const cachePath = cachePathForBundledArtifact(resourceDir)
  if (!cachePath) {
    return undefined
  }

  if (materializedDatabaseIsValid(cachePath, manifest)) {
    return cachePath
  }

  return withFileLockSync(materializationLockPath(cachePath), () => {
    if (materializedDatabaseIsValid(cachePath, manifest)) {
      return cachePath
    }

    const archiveStats = fs.statSync(archivePath)
    if (!archiveStats.isFile() || archiveStats.size !== manifest.archiveSizeBytes) {
      throw new Error(
        `Knowledge Graph archive size mismatch: expected ${manifest.archiveSizeBytes}, got ${archiveStats.size}`,
      )
    }

    const archiveChecksum = sha256FileSync(archivePath)
    if (archiveChecksum !== manifest.archiveChecksum) {
      throw new Error(
        `Knowledge Graph archive checksum mismatch: expected ${manifest.archiveChecksum}, got ${archiveChecksum}`,
      )
    }

    const archiveBytes = fs.readFileSync(archivePath)
    const databaseBytes = zstdDecompressSync(archiveBytes)
    const databaseChecksum = sha256(databaseBytes)
    if (databaseChecksum !== manifest.databaseChecksum) {
      throw new Error(
        `Knowledge Graph database checksum mismatch: expected ${manifest.databaseChecksum}, got ${databaseChecksum}`,
      )
    }

    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`

    try {
      fs.writeFileSync(tempPath, databaseBytes)
      fs.rmSync(cachePath, { force: true })
      fs.renameSync(tempPath, cachePath)
      rememberMaterializedDatabaseValidation(cachePath, manifest)
    } finally {
      fs.rmSync(tempPath, { force: true })
    }

    return cachePath
  })
}

export function resolveKnowledgeGraphDatabasePath() {
  const configured = resolveConfiguredKnowledgeGraphPath()
  if (configured && fs.existsSync(configured)) {
    return configured
  }

  for (const root of candidateRoots()) {
    let current = root

    while (true) {
      for (const candidate of candidatePathsForRoot(current)) {
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }

      for (const resourceDir of candidateResourceDirectoriesForRoot(current)) {
        const materialized = materializeBundledKnowledgeGraphDatabase(resourceDir)
        if (materialized && fs.existsSync(materialized)) {
          return materialized
        }
      }

      const legacySourcePath = legacySourceDatabasePathForRoot(current)
      if (fs.existsSync(legacySourcePath)) {
        return legacySourcePath
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return configured
}

export function requireKnowledgeGraphDatabasePath() {
  const resolved = resolveKnowledgeGraphDatabasePath()
  if (resolved && fs.existsSync(resolved)) {
    return resolved
  }

  throw new Error(
    [
      "Knowledge Graph database not found.",
      `Set ${KNOWLEDGE_GRAPH_DB_ENV} or bundle ${KNOWLEDGE_GRAPH_DB_FILENAME} under the desktop resources directory.`,
    ].join(" "),
  )
}
