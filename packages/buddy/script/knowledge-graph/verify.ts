import { createHash } from "node:crypto"
import { createReadStream, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseKnowledgeGraphArtifactManifest } from "../../src/learning/features/standards/artifact"
import { parseKnowledgeGraphLockfile } from "../../src/learning/features/standards/lockfile"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_LOCKFILE_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "../../src/learning/features/standards/constants"

const KNOWLEDGE_GRAPH_OUTPUT_DIR_ENV = "BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR"
const BACKEND_DIR = path.resolve(import.meta.dir, "../..")
const DEFAULT_OUTPUT_DIR = path.resolve(BACKEND_DIR, "resources/knowledge-graph")

function outputDir() {
  const configured = process.env[KNOWLEDGE_GRAPH_OUTPUT_DIR_ENV]?.trim()
  return configured ? path.resolve(configured) : DEFAULT_OUTPUT_DIR
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256")
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(bytes)
  }

  return hash.digest("hex")
}

function requireFile(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} missing at ${filePath}. Run \`bun run update:knowledge-graph\`.`)
  }
}

export async function runKnowledgeGraphVerify() {
  const directory = outputDir()
  const lockfilePath = path.join(directory, KNOWLEDGE_GRAPH_LOCKFILE_FILENAME)
  const manifestPath = path.join(directory, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)
  const archivePath = path.join(directory, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
  const checksumPath = path.join(directory, KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME)

  requireFile(lockfilePath, "Knowledge Graph lockfile")
  requireFile(manifestPath, "Knowledge Graph manifest")
  requireFile(archivePath, "Knowledge Graph archive")
  requireFile(checksumPath, "Knowledge Graph checksum")

  const lockfile = parseKnowledgeGraphLockfile(
    JSON.parse(readFileSync(lockfilePath, "utf8")) as unknown,
  )
  if (!lockfile) {
    throw new Error(`Knowledge Graph lockfile is invalid at ${lockfilePath}`)
  }

  const manifest = parseKnowledgeGraphArtifactManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
  )
  if (!manifest) {
    throw new Error(`Knowledge Graph manifest is invalid at ${manifestPath}`)
  }

  const checksumText = readFileSync(checksumPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!checksumText) {
    throw new Error(`Knowledge Graph checksum file is empty at ${checksumPath}`)
  }

  const actualArchiveSha = await sha256File(archivePath)
  if (actualArchiveSha !== lockfile.artifact.archiveSha256) {
    throw new Error(
      [
        `Knowledge Graph archive checksum mismatch.`,
        `Expected: ${lockfile.artifact.archiveSha256}`,
        `Got: ${actualArchiveSha}`,
        "Run `bun run update:knowledge-graph` to refresh the committed artifact.",
      ].join(" "),
    )
  }

  if (checksumText !== `${lockfile.artifact.archiveSha256}  ${lockfile.artifact.archiveFilename}`) {
    throw new Error(`Knowledge Graph checksum file does not match lockfile at ${checksumPath}`)
  }

  if (
    manifest.archiveFilename !== lockfile.artifact.archiveFilename ||
    manifest.archiveChecksum !== lockfile.artifact.archiveSha256 ||
    manifest.databaseFilename !== lockfile.artifact.databaseFilename ||
    manifest.databaseChecksum !== lockfile.artifact.databaseSha256 ||
    manifest.nodesURL !== lockfile.source.nodes.url ||
    manifest.relationshipsURL !== lockfile.source.relationships.url ||
    manifest.schemaVersion !== lockfile.build.schemaVersion ||
    manifest.version !== lockfile.source.version
  ) {
    throw new Error(`Knowledge Graph manifest does not match lockfile at ${manifestPath}`)
  }

  console.log(`[knowledge-graph] verified committed artifact bundle in ${directory}`)
}
