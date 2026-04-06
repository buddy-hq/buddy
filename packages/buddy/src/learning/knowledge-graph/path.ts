import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { zstdDecompressSync } from "node:zlib"
import {
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_ENV,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
  KNOWLEDGE_GRAPH_RESOURCE_DIRECTORY,
  KNOWLEDGE_GRAPH_SOURCE_DB_FILENAME,
} from "./constants"
import { parseKnowledgeGraphArtifactManifest } from "./artifact"

const KNOWLEDGE_GRAPH_CACHE_DIRECTORY_NAME = "buddy-knowledge-graph"

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

  if (fs.existsSync(cachePath)) {
    return cachePath
  }

  const archiveBytes = fs.readFileSync(archivePath)
  const archiveChecksum = sha256(archiveBytes)
  if (archiveChecksum !== manifest.archiveChecksum) {
    throw new Error(
      `Knowledge Graph archive checksum mismatch: expected ${manifest.archiveChecksum}, got ${archiveChecksum}`,
    )
  }

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
  } finally {
    fs.rmSync(tempPath, { force: true })
  }

  return cachePath
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
